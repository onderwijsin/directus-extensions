import type { Cache } from '@directus/memory'
import type {
	Accountability,
	ApiExtensionContext,
	Filter,
	Policy,
	SchemaOverview,
} from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'

import { ipInNetworks } from '@directus/utils/node'
import { attempt } from '@onderwijsin/directus-extension-utils'

import { initializeCache, withCache, type CacheEnv } from './cache'
import { cacheConfigSchema } from './config'

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

interface RoleParentRecord {
	id: string
	parent: string | null
}

/**
 * Resolves descendant roles nested below the user's effective roles.
 *
 * Directus keeps only the directly assigned role in request accountability. Nested roles are
 * expanded explicitly so consumers can reproduce Directus's aggregate policy behavior.
 *
 * @param roleIds - Roles directly present in the request accountability.
 * @param services - Directus API services.
 * @param schema - Current Directus schema.
 * @param readAccountability - Accountability used to read role metadata.
 * @returns Direct roles followed by their nested descendants.
 */
async function resolveEffectiveRoleIds(
	roleIds: string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	readAccountability: Accountability | null,
): Promise<string[]> {
	const roles = new services.ItemsService<RoleParentRecord>('directus_roles', {
		accountability: readAccountability,
		schema,
	})
	const effectiveRoleIds = new Set(roleIds)
	let parents = [...effectiveRoleIds]

	while (parents.length > 0) {
		const descendants = await roles.readByQuery({
			filter: { parent: { _in: parents } },
			fields: ['id', 'parent'],
			limit: -1,
		})
		const nextParents: string[] = []

		for (const role of descendants) {
			if (!effectiveRoleIds.has(role.id)) {
				effectiveRoleIds.add(role.id)
				nextParents.push(role.id)
			}
		}

		parents = nextParents
	}

	return [...effectiveRoleIds]
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
 * Keeps policies whose IP allow list permits the current request.
 *
 * @param policies - Access rows returned by Directus.
 * @param ip - Client IP address from the current accountability.
 * @returns Access rows effective for the client IP.
 */
export function filterPoliciesByIp(
	policies: PolicyAccessRow[],
	ip: string | null | undefined,
): PolicyAccessRow[] {
	return policies.filter(({ policy }) => {
		if (!policy.ip_access || policy.ip_access.length === 0) return true
		if (!ip) return false

		return ipInNetworks(ip, policy.ip_access)
	})
}

/**
 * Removes the internal IP allow list before returning a policy to a consumer.
 *
 * @param policy - Policy row including its internal IP rule.
 * @returns Public policy fields.
 */
function toPolicyRecord(policy: PolicyAccessRow['policy']): PolicyRecord {
	const { ip_access: _ipAccess, ...publicPolicy } = policy
	return publicPolicy
}

const POLICIES_CACHE_NAMESPACE = 'directus:policies'
const POLICIES_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 3

/**
 * Creates a Redis cache instance for policy data.
 * @param env - The Directus environment
 * @returns Redis cache instance, or null when Redis caching is not configured.
 */
export function initializePolicyCache(env: CacheEnv): Cache | null {
	const parsed = cacheConfigSchema.safeParse(env)
	if (!parsed.success || parsed.data.CACHE_STORE !== 'redis') return null

	return initializeCache(parsed.data, {
		ttl: POLICIES_CACHE_TTL_MS,
		namespace: POLICIES_CACHE_NAMESPACE,
	})
}

/**
 * Resolves effective policies using Directus access-row semantics.
 *
 * Caching is opt-in because policy results are security-sensitive derived data. When enabled, the
 * helper uses the shared Redis-only policy namespace with a three-day TTL; policy mutations clear
 * the complete namespace through `registerPolicyCacheInvalidation`.
 *
 * @param accountability - Current request accountability.
 * @param services - Directus API services.
 * @param schema - Current Directus schema.
 * @param cache - Initialized Redis policy cache, or null to disable invalidation.
 * @param readAccountability - Accountability used to read access metadata. Defaults to the
 * requesting accountability. Pass `null` only for trusted server-side consumers that must resolve
 * policy assignments without Directus CRUD filtering.
 * @returns Effective policies in Directus priority order.
 */
export async function fetchPolicies(
	accountability: Accountability,
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	cache: Cache | null,
	readAccountability: Accountability | null = accountability,
): Promise<PolicyRecord[]> {
	const effectiveRoleIds = await resolveEffectiveRoleIds(
		accountability.roles,
		services,
		schema,
		readAccountability,
	)
	const effectiveAccountability = { ...accountability, roles: effectiveRoleIds }
	const cacheKey = `effective:${JSON.stringify({
		roles: effectiveRoleIds,
		user: effectiveAccountability.user,
		ip: effectiveAccountability.ip,
		readAs: readAccountability
			? {
					user: readAccountability.user,
					roles: readAccountability.roles,
					ip: readAccountability.ip,
					admin: readAccountability.admin,
				}
			: null,
	})}`
	return withCache({ cache, key: cacheKey }, async () => {
		const accessService = new services.AccessService({
			accountability: readAccountability,
			schema,
		})
		const accessRows = (await accessService.readByQuery({
			filter: policyAccessFilter(effectiveAccountability),
			fields: [
				...POLICY_FIELDS.map((field) => `policy.${field}`),
				'policy.ip_access',
				'role',
			],
			limit: -1,
		})) as PolicyAccessRow[]

		const filteredAccessRows = filterPoliciesByIp(accessRows, accountability.ip)
		filteredAccessRows.sort((a, b) => {
			if (!a.role && !b.role) return 0
			if (!a.role) return 1
			if (!b.role) return -1

			return effectiveRoleIds.indexOf(a.role) - effectiveRoleIds.indexOf(b.role)
		})

		const policies = new Map<string, PolicyRecord>()
		for (const { policy } of filteredAccessRows) {
			const publicPolicy = toPolicyRecord(policy)
			policies.set(publicPolicy.id, publicPolicy)
		}

		return [...policies.values()]
	})
}

/**
 * Checks whether every requested policy is effective for an accountability.
 *
 * @param accountability - Current request accountability.
 * @param policyIds - One or more policy IDs to require.
 * @param services - Directus API services.
 * @param schema - Current Directus schema.
 * @param cache - Initialized Redis policy cache, or null to disable caching.
 * @param readAccountability - Accountability used to read access metadata. Defaults to the
 * requesting accountability. Pass `null` only for trusted server-side consumers that must resolve
 * policy assignments without Directus CRUD filtering.
 * @returns Whether all requested policies are effective.
 */
export async function hasPolicies(
	accountability: Accountability,
	policyIds: string | string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	cache: Cache | null,
	readAccountability: Accountability | null = accountability,
): Promise<boolean> {
	const required = Array.isArray(policyIds) ? policyIds : [policyIds]
	if (required.length === 0) return true

	const effectivePolicies = await fetchPolicies(
		accountability,
		services,
		schema,
		cache,
		readAccountability,
	)
	const effectivePolicyIds = new Set(effectivePolicies.map(({ id }) => id))
	return required.every((policyId) => effectivePolicyIds.has(policyId))
}

/**
 * Invalidates policy cache when policy-related Directus system collections mutate.
 * @param hook - Directus hook registration functions.
 * @param context - Directus extension context.
 * @param cache - Initialized Redis policy cache, or null to disable caching.
 * @returns Nothing.
 */
export function registerPolicyCacheInvalidation(
	hook: RegisterFunctions,
	context: ApiExtensionContext,
	cache: Cache | null,
): void {
	const events = ['access', 'policies', 'roles']
		.map((event) => [`${event}.create`, `${event}.update`, `${event}.delete`])
		.flat()

	if (!cache) return

	for (const event of events) {
		hook.action(event, async () => {
			const { error } = await attempt(() => cache.clear())
			if (error) {
				context.logger.error('Failed to invalidate policy cache.', {
					error,
				})
			}
		})
	}
}
