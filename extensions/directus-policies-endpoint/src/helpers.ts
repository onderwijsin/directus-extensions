import type { AbstractService, Policy, Role, User } from '@directus/types'

import {
	hasKey,
	isFiniteNumber,
	isInteger,
	isRecord,
	isString,
	isArray,
} from '@onderwijsin/directus-extension-utils'

export const POLICY_FIELDS = [
	'id',
	'name',
	'icon',
	'description',
	'enforce_tfa',
	'admin_access',
	'app_access',
] as const

export type PolicyRecord = Pick<
	Policy,
	'id' | 'name' | 'icon' | 'description' | 'enforce_tfa' | 'admin_access' | 'app_access'
>

interface PolicyRelation {
	policy: PolicyRecord
}

type PolicyValue = PolicyRecord | PolicyRelation

export type RoleRecord = Omit<Partial<Role>, 'id'> & {
	id: string
	policies?: PolicyValue[]
	children?: RoleRecord[]
} & Record<string, unknown>

export type UserRecord = Omit<Partial<User>, 'policies' | 'role'> & {
	policies: PolicyValue[]
	role: RoleRecord | null
} & Record<string, unknown>

/**
 * Parses the optional bounded role depth from an endpoint query.
 *
 * @param query - The request query object.
 * @returns The requested depth, or undefined for recursive traversal.
 */
export function parseDepth(query: unknown): number | undefined {
	if (!isRecord(query) || !hasKey(query, 'depth')) return undefined

	const value = query.depth
	const raw = isString(value)
		? value
		: isArray(value) && isString(value[0])
			? value[0]
			: undefined

	if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined

	const depth = Number(raw)
	return isFiniteNumber(depth) && isInteger(depth) && Number.isSafeInteger(depth)
		? depth
		: undefined
}

/**
 * Builds the Directus relation fields for a bounded role traversal.
 *
 * @param depth - Number of nested child-role levels to include.
 * @returns The policy fields at the requested relation depth.
 */
export function nestedRoleFields(depth: number): string[] {
	let prefix = ''

	for (let index = 0; index < depth; index += 1) {
		prefix += 'children.'
	}

	return POLICY_FIELDS.map((field) => `${prefix}policies.policy.${field}`)
}

/**
 * Resolves policy junction records returned by Directus 12 to policy records.
 * @param values - Policy records or policy junction records.
 * @returns The underlying policy records.
 */
export function resolvePolicies(values: PolicyValue[]): PolicyRecord[] {
	return values.flatMap((value) => ('policy' in value ? [value.policy] : [value]))
}

/**
 * Collects direct and nested policies while preserving first-seen order.
 *
 * @param user - The user and bounded role tree returned by Directus.
 * @returns The de-duplicated policies.
 */
export function collectPolicies(user: UserRecord): PolicyRecord[] {
	const policies = new Map<string, PolicyRecord>()
	/**
	 * Adds a policy to the accumulator, replacing duplicate IDs consistently.
	 *
	 * @param policy - Policy to add.
	 * @returns Nothing.
	 */
	const add = (policy: PolicyRecord): void => {
		policies.set(policy.id, policy)
	}

	for (const policy of resolvePolicies(user.policies)) add(policy)

	/**
	 * Recursively collects policies from a bounded role tree.
	 *
	 * @param role - Role to collect, if present.
	 * @returns Nothing.
	 */
	const collectRole = (role: RoleRecord | null): void => {
		if (!role) return

		for (const policy of resolvePolicies(role.policies ?? [])) add(policy)
		for (const child of role.children ?? []) collectRole(child)
	}

	collectRole(user.role)

	return [...policies.values()]
}

/**
 * Recursively fetches each reachable role once and collects its policies.
 *
 * @param roles - Directus role service.
 * @param roleId - Role ID to fetch.
 * @param policies - Policy accumulator.
 * @param visited - Role IDs already fetched during this traversal.
 * @returns A promise that resolves after the role tree has been traversed.
 */
export async function walkRole(
	roles: AbstractService<RoleRecord>,
	roleId: string,
	policies: Map<string, PolicyRecord>,
	visited: Set<string>,
): Promise<void> {
	if (visited.has(roleId)) return
	visited.add(roleId)

	const role = await roles.readOne(roleId, {
		fields: [...POLICY_FIELDS.map((field) => `policies.policy.${field}`), 'children.id'],
	})

	for (const policy of resolvePolicies(role.policies ?? [])) policies.set(policy.id, policy)
	for (const child of role.children ?? []) {
		await walkRole(roles, child.id, policies, visited)
	}
}
