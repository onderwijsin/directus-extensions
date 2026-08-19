import type { Cache } from '@directus/memory'
import type {
	Accountability,
	ApiExtensionContext,
	Filter,
	Policy,
	SchemaOverview,
} from '@directus/types'

import { filterPoliciesByIp } from './filter-policies-by-ip'

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

export interface PolicyAccessRow {
	policy: PolicyRecord & { ip_access: string[] | null }
	role: string | null
}

/**
 * Removes the internal IP allow list before returning a policy to the consumer.
 *
 * @param policy - Policy row including its internal IP rule.
 * @returns Public policy fields.
 */
function toPolicyRecord(policy: PolicyAccessRow['policy']): PolicyRecord {
	const { ip_access: _ipAccess, ...publicPolicy } = policy
	return publicPolicy
}

/**
 * Builds the Directus access filter for an accountability.
 *
 * @param accountability - Current request accountability.
 * @returns Filter matching direct, role, or public access assignments.
 */
export function policyAccessFilter(accountability: Accountability): Filter {
	const roleFilter: Filter =
		accountability.roles.length === 0
			? { _and: [{ role: { _null: true } }, { user: { _null: true } }] }
			: { role: { _in: accountability.roles } }

	return accountability.user
		? { _or: [{ user: { _eq: accountability.user } }, roleFilter] }
		: roleFilter
}

/**
 * Resolves effective policy records using Directus access-row semantics.
 *
 * @param accountability - Current request accountability.
 * @param services - Directus API services.
 * @param schema - Current Directus schema.
 * @param cache - Configured policy cache, when caching is enabled.
 * @returns Effective policies in Directus priority order.
 */
export async function fetchPolicies(
	accountability: Accountability,
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	cache: Cache | null,
): Promise<PolicyRecord[]> {
	const cacheKey = `policies-endpoint:${JSON.stringify({
		roles: accountability.roles,
		user: accountability.user,
		ip: accountability.ip,
	})}`
	const cached = await cache?.get<PolicyRecord[]>(cacheKey)
	if (cached) return cached

	const accessService = new services.AccessService({ accountability, schema })
	const accessRows = (await accessService.readByQuery({
		filter: policyAccessFilter(accountability),
		fields: [...POLICY_FIELDS.map((field) => `policy.${field}`), 'policy.ip_access', 'role'],
		limit: -1,
	})) as PolicyAccessRow[]

	const filteredAccessRows = filterPoliciesByIp(accessRows, accountability.ip)
	filteredAccessRows.sort((a, b) => {
		if (!a.role && !b.role) return 0
		if (!a.role) return 1
		if (!b.role) return -1

		return accountability.roles.indexOf(a.role) - accountability.roles.indexOf(b.role)
	})

	const policies = new Map<string, PolicyRecord>()
	for (const { policy } of filteredAccessRows) {
		const publicPolicy = toPolicyRecord(policy)
		policies.set(publicPolicy.id, publicPolicy)
	}

	const result = [...policies.values()]
	await cache?.set(cacheKey, result)

	return result
}
