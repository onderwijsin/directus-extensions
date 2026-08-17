import { randomBytes, randomUUID } from 'node:crypto'

import {
	createDirectus,
	createPermission,
	createPolicy,
	createRole,
	createUser,
	deletePermission,
	deletePolicy,
	deleteRole,
	deleteUser,
	readUser,
	rest,
	staticToken,
	customEndpoint,
	type DirectusClient,
	type RestClient,
	type StaticTokenClient,
} from '@directus/sdk'

import { waitForDirectusLog, type DirectusLogOptions } from './directus-log'

export interface DirectusE2EClientOptions {
	baseUrl: string
	token: string
	composeFiles: string[]
	composeProject: string
}

interface E2EPost {
	id: string | number
	title: string
}

interface DirectusE2ESchema {
	posts: E2EPost[]
}

export type DirectusE2ESdkClient = DirectusClient<DirectusE2ESchema> &
	RestClient<DirectusE2ESchema> &
	StaticTokenClient<DirectusE2ESchema>

export interface EphemeralPermission {
	collection: string
	action: string
	fields?: string[]
	permissions?: Record<string, unknown> | null
	validation?: Record<string, unknown> | null
	presets?: Record<string, unknown> | null
}

export interface EphemeralPolicy {
	name: string
	icon?: string
	description?: string | null
	enforce_tfa?: boolean
	admin_access?: boolean
	app_access?: boolean
	permissions?: EphemeralPermission[]
}

export interface EphemeralRole {
	name: string
	icon?: string
	description?: string | null
	parent?: string | null
	policies?: EphemeralPolicy[]
}

export interface CreateEphemeralUserOptions {
	role?: EphemeralRole
	policies?: EphemeralPolicy[]
}

export interface EphemeralUser {
	id: string
	dispose(): Promise<void>
}

export interface DirectusE2EClient extends DirectusE2ESdkClient {
	withUserContext<T>(
		userId: string,
		callback: (client: DirectusE2ESdkClient) => Promise<T>,
	): Promise<T>
	createEphemeralUser(options?: CreateEphemeralUserOptions): Promise<EphemeralUser>
	waitForLog(pattern: RegExp, timeoutMs?: number): Promise<string>
}

/**
 * Adds the policy relationship required by a Directus permission payload.
 * @param permission - Permission definition without its policy identifier.
 * @param policyId - Policy primary key.
 * @returns A permission payload linked to the policy.
 */
const defaultPermission = (permission: EphemeralPermission, policyId: string) => ({
	...permission,
	policy: policyId,
})

/**
 * Creates an SDK-backed client for the isolated Directus E2E stack.
 * @param options - Connection and Compose details for the E2E stack.
 * @returns A root-authenticated SDK client with E2E fixture helpers.
 */
export function createDirectusE2EClient(options: DirectusE2EClientOptions): DirectusE2EClient {
	/**
	 * Creates an SDK client authenticated with one static token.
	 * @param token - Directus static token.
	 * @returns An SDK client configured with REST and static-token support.
	 */
	const createClient = (token: string): DirectusE2ESdkClient =>
		createDirectus<DirectusE2ESchema>(options.baseUrl).with(rest()).with(staticToken(token))

	const rootClient = createClient(options.token)

	/**
	 * Runs a callback with a fresh SDK client authenticated as a specific user.
	 * @param userId - User primary key.
	 * @param callback - Work to perform in the user context.
	 * @returns The callback result.
	 */
	const withUserContext = async <T>(
		userId: string,
		callback: (client: DirectusE2ESdkClient) => Promise<T>,
	): Promise<T> => {
		const user = await rootClient.request(readUser(userId, { fields: ['token'] }))
		if (!user.token) throw new Error(`Directus user ${userId} does not have a static token`)

		return callback(createClient(user.token))
	}

	/**
	 * Creates a policy and all nested permission rules.
	 * @param policy - Policy definition.
	 * @returns The created policy identifier.
	 */
	const createPolicyWithPermissions = async (
		policy: EphemeralPolicy,
	): Promise<{ id: string; permissionIds: number[] }> => {
		const { permissions = [], ...policyData } = policy
		const created = await rootClient.request(createPolicy(policyData))
		const permissionIds: number[] = []
		for (const permission of permissions) {
			const createdPermission = await rootClient.request(
				createPermission(defaultPermission(permission, created.id)),
			)
			permissionIds.push(createdPermission.id)
		}
		return { id: created.id, permissionIds }
	}

	/**
	 * Assigns a policy to a role or user through the SDK custom endpoint command.
	 * @param assignment - Access assignment.
	 * @returns Nothing.
	 */
	const assignPolicy = async (assignment: { role?: string; user?: string; policy: string }) => {
		await rootClient.request(
			customEndpoint({
				path: '/access',
				method: 'POST',
				body: JSON.stringify([assignment]),
			}),
		)
	}

	/**
	 * Creates an isolated user, role, policies, permissions, and access assignments.
	 * @param userOptions - Nested role and policy definitions.
	 * @returns The user identifier and an idempotent disposer.
	 */
	const createEphemeralUser = async (
		userOptions: CreateEphemeralUserOptions = {},
	): Promise<EphemeralUser> => {
		const policyIds: string[] = []
		const permissionIds: number[] = []
		const roleIds: string[] = []
		const token = randomBytes(32).toString('hex')
		const email = `e2e-${randomUUID()}@example.com`
		let userId: string | undefined

		try {
			const directPolicyIds = []
			for (const policy of userOptions.policies ?? []) {
				const createdPolicy = await createPolicyWithPermissions(policy)
				policyIds.push(createdPolicy.id)
				permissionIds.push(...createdPolicy.permissionIds)
				directPolicyIds.push(createdPolicy.id)
			}

			let roleId: string | undefined
			if (userOptions.role) {
				const rolePolicyIds = []
				for (const policy of userOptions.role.policies ?? []) {
					const createdPolicy = await createPolicyWithPermissions(policy)
					policyIds.push(createdPolicy.id)
					permissionIds.push(...createdPolicy.permissionIds)
					rolePolicyIds.push(createdPolicy.id)
				}

				const { policies: _policies, parent, ...roleData } = userOptions.role
				const role = await rootClient.request(
					createRole(parent === null ? roleData : { ...roleData, parent }),
				)
				roleId = role.id
				roleIds.push(roleId)
				for (const policyId of rolePolicyIds)
					await assignPolicy({ role: roleId, policy: policyId })
			}

			const user = await rootClient.request(
				createUser({
					email,
					password: randomBytes(24).toString('hex'),
					status: 'active',
					token,
					role: roleId ?? null,
				}),
			)
			userId = user.id

			for (const policyId of directPolicyIds)
				await assignPolicy({ user: user.id, policy: policyId })

			let disposed = false
			return {
				id: user.id,
				/**
				 * Disposes of the ephemeral user and all resources created for it.
				 * @returns A promise that resolves when cleanup is complete.
				 */
				dispose: async () => {
					if (disposed) return
					disposed = true
					await rootClient.request(deleteUser(user.id))
					for (const roleIdToDelete of roleIds)
						await rootClient.request(deleteRole(roleIdToDelete))
					for (const permissionId of permissionIds)
						await rootClient.request(deletePermission(permissionId))
					for (const policyId of policyIds)
						await rootClient.request(deletePolicy(policyId))
				},
			}
		} catch (error) {
			if (userId) await rootClient.request(deleteUser(userId)).catch(() => undefined)
			for (const roleIdToDelete of roleIds)
				await rootClient.request(deleteRole(roleIdToDelete)).catch(() => undefined)
			for (const permissionId of permissionIds)
				await rootClient.request(deletePermission(permissionId)).catch(() => undefined)
			for (const policyId of policyIds)
				await rootClient.request(deletePolicy(policyId)).catch(() => undefined)
			throw error
		}
	}

	/**
	 * Waits for extension output in the Directus Compose logs.
	 * @param pattern - Regular expression to match in the logs.
	 * @param timeoutMs - Optional polling timeout in milliseconds.
	 * @returns The complete matching log output.
	 */
	const waitForLog = (pattern: RegExp, timeoutMs?: number) => {
		const logOptions: DirectusLogOptions = {
			composeFiles: options.composeFiles,
			composeProject: options.composeProject,
			pattern,
			timeoutMs,
		}
		return waitForDirectusLog(logOptions)
	}

	return Object.assign(rootClient, {
		withUserContext,
		createEphemeralUser,
		waitForLog,
	})
}
