import type { Accountability, ApiExtensionContext, Filter, SchemaOverview } from '@directus/types'
import type { NextFunction } from 'express'

import { ForbiddenError } from '@directus/errors'
import { hasKey, isArray, isRecord, isString } from '@onderwijsin/directus-extension-utils'

interface AccessRecord {
	policy?: unknown
}

/**
 * Narrows an access row returned by Directus.
 * @param value - Unknown access row.
 * @returns Whether the value has an access-record shape.
 */
const isAccessRecord = (value: unknown): value is AccessRecord => isRecord(value)

/**
 * Extracts the related policy identifier from an access row.
 * @param value - Access row.
 * @returns Related policy identifier, when present.
 */
const getPolicyId = (value: AccessRecord): string | undefined => {
	if (isString(value.policy)) return value.policy
	if (!isRecord(value.policy) || !hasKey(value.policy, 'id') || !isString(value.policy.id)) {
		return undefined
	}

	return value.policy.id
}

/**
 * Checks whether every requested policy is assigned to the accountability's user or effective
 * roles.
 *
 * This mirrors Directus's policy-assignment resolution, including public policies for
 * accountabilities without effective roles. It intentionally does not evaluate `policy.ip_access`
 * against `accountability.ip` yet.
 *
 * TODO: Add IP-based policy filtering if this extension ever requires parity with Directus's full
 * `fetchPolicies` behavior.
 *
 * @see https://github.com/directus/directus/blob/06027c83fc09551e1db78c1ea6dc5f69a74ed38b/api/src/permissions/lib/fetch-policies.ts
 *
 * @param accountability - Directus accountability for the current request.
 * @param data - One or more policy IDs to require.
 * @param services - Directus API services.
 * @param schema - Current Directus schema used to construct AccessService.
 * @returns Whether all requested policies are effective.
 */
export async function isAssignedPolicy(
	accountability: Accountability,
	data: string | string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
): Promise<boolean> {
	const policyIds = isArray(data) ? data : [data]
	if (policyIds.length === 0) return true

	const roleFilter: Filter =
		accountability.roles.length === 0
			? { _and: [{ role: { _null: true } }, { user: { _null: true } }] }
			: { role: { _in: accountability.roles } }
	const filter = accountability.user
		? { _or: [{ user: { _eq: accountability.user } }, roleFilter] }
		: roleFilter

	const accessService = new services.AccessService({ accountability: null, schema })
	const accessRows = await accessService.readByQuery({
		filter,
		fields: ['policy.id'],
		limit: -1,
	})
	const effectivePolicyIds = new Set(
		accessRows.filter(isAccessRecord).map(getPolicyId).filter(isString),
	)

	return policyIds.every((policyId) => effectivePolicyIds.has(policyId))
}

/**
 * Forwards authorization for one or more policies through an Express continuation.
 * Administrators bypass policy assignment resolution.
 * @param accountability - Directus accountability for the current request.
 * @param data - One or more policy IDs to require.
 * @param services - Directus API services.
 * @param schema - Current Directus schema used to construct AccessService.
 * @param next - Express continuation receiving an authorization error or no argument.
 * @returns Nothing.
 */
export async function requirePolicies(
	accountability: Accountability,
	data: string | string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	next: NextFunction,
): Promise<void> {
	if (
		accountability.admin ||
		(hasKey(accountability, 'admin_access') && accountability.admin_access === true)
	) {
		next()
		return
	}

	try {
		const assigned = await isAssignedPolicy(accountability, data, services, schema)
		if (assigned) next()
		else next(new ForbiddenError())
	} catch (error: unknown) {
		next(error)
	}
}
