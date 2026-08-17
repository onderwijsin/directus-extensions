import {
	authentication,
	createDirectus,
	createPolicy,
	createRole,
	createUser,
	customEndpoint,
	deletePolicy,
	deleteRole,
	deleteUser,
	rest,
} from '@workspace/test-utils'
import { createDirectusE2EClient } from '@workspace/test-utils'
import { describe, expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT

if (!baseUrl || !token || !composeFilesValue || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })

interface PolicyResponse {
	id: string
	name: string
	icon: string
	description: string | null
	enforce_tfa: boolean | null
	admin_access: boolean
	app_access: boolean
}

function policyPayload(name: string, adminAccess = false) {
	return {
		name,
		icon: 'verified',
		description: `${name} policy`,
		enforce_tfa: false,
		admin_access: adminAccess,
		app_access: true,
	}
}

async function assignPolicyToRole(role: string, policy: string): Promise<void> {
	await client.request(
		customEndpoint({
			path: '/access',
			method: 'POST',
			body: JSON.stringify([{ role, policy }]),
		}),
	)
}

async function assignPolicyToUser(user: string, policy: string): Promise<void> {
	await client.request(
		customEndpoint({
			path: '/access',
			method: 'POST',
			body: JSON.stringify([{ user, policy }]),
		}),
	)
}

describe('users policies endpoint', () => {
	it('resolves direct, nested, and de-duplicated policies', async () => {
		const email = `policies-e2e-${Date.now()}@example.com`
		const password = `policies-e2e-password-${Date.now()}`
		let userId: string | undefined
		let rootRoleId: string | undefined
		let childRoleId: string | undefined
		let grandchildRoleId: string | undefined
		let directPolicyId: string | undefined
		let childPolicyId: string | undefined
		let grandchildPolicyId: string | undefined

		try {
			const rootRole = await client.request(
				createRole({
					name: 'E2E root role',
					icon: 'group',
					description: 'E2E root role',
				}),
			)
			rootRoleId = rootRole.id

			const childRole = await client.request(
				createRole({
					name: 'E2E child role',
					icon: 'group',
					description: 'E2E child role',
					parent: rootRole.id,
				}),
			)
			childRoleId = childRole.id

			const grandchildRole = await client.request(
				createRole({
					name: 'E2E grandchild role',
					icon: 'group',
					description: 'E2E grandchild role',
					parent: childRole.id,
				}),
			)
			grandchildRoleId = grandchildRole.id

			const directPolicy = await client.request(
				createPolicy(policyPayload('E2E direct policy', true)),
			)
			directPolicyId = directPolicy.id
			await assignPolicyToRole(rootRole.id, directPolicy.id)

			const childPolicy = await client.request(
				createPolicy(policyPayload('E2E child policy')),
			)
			childPolicyId = childPolicy.id
			await assignPolicyToRole(childRole.id, directPolicy.id)
			await assignPolicyToRole(childRole.id, childPolicy.id)

			const grandchildPolicy = await client.request(
				createPolicy(policyPayload('E2E grandchild policy')),
			)
			grandchildPolicyId = grandchildPolicy.id
			await assignPolicyToRole(grandchildRole.id, grandchildPolicy.id)

			const user = await client.request(
				createUser({
					email,
					password,
					first_name: 'Policies E2E',
					status: 'active',
					role: rootRole.id,
				}),
			)
			userId = user.id
			await assignPolicyToUser(user.id, directPolicy.id)

			const credentialClient = createDirectus(baseUrl)
				.with(rest())
				.with(authentication('json'))
			await credentialClient.login({ email, password }, { mode: 'json' })
			const recursive = await credentialClient.request<PolicyResponse[]>(
				customEndpoint({ path: '/users/me/policies', method: 'GET' }),
			)
			expect(recursive.map((policy) => policy.id)).toEqual([
				directPolicy.id,
				childPolicy.id,
				grandchildPolicy.id,
			])
			expect(recursive).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: directPolicy.id,
						name: 'E2E direct policy',
						admin_access: true,
					}),
				]),
			)

			const depthZero = await credentialClient.request<PolicyResponse[]>(
				customEndpoint({ path: '/users/me/policies', method: 'GET', params: { depth: 0 } }),
			)
			expect(depthZero.map((policy) => policy.id)).toEqual([directPolicy.id])

			const depthOne = await credentialClient.request<PolicyResponse[]>(
				customEndpoint({ path: '/users/me/policies', method: 'GET', params: { depth: 1 } }),
			)
			expect(depthOne.map((policy) => policy.id)).toEqual([directPolicy.id, childPolicy.id])
		} finally {
			if (userId) await client.request(deleteUser(userId))
			if (grandchildRoleId) await client.request(deleteRole(grandchildRoleId))
			if (childRoleId) await client.request(deleteRole(childRoleId))
			if (rootRoleId) await client.request(deleteRole(rootRoleId))
			if (grandchildPolicyId) await client.request(deletePolicy(grandchildPolicyId))
			if (childPolicyId) await client.request(deletePolicy(childPolicyId))
			if (directPolicyId) await client.request(deletePolicy(directPolicyId))
		}
	})
})
