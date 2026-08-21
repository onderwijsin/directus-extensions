import type { Cache } from '@directus/memory'
import type { Accountability, ApiExtensionContext, SchemaOverview } from '@directus/types'
import type { NextFunction } from 'express'

import { ForbiddenError } from '@directus/errors'
import { hasKey } from '@onderwijsin/directus-extension-utils'
import { hasPolicies } from '@onderwijsin/directus-extension-utils/server'

/**
 * @param accountability - Directus accountability for the current request.
 * @param data - One or more policy IDs to require.
 * @param services - Directus API services.
 * @param schema - Current Directus schema used to construct AccessService.
 * @param cache - Initialized Redis policy cache, or null to disable caching.
 * @returns Whether all requested policies are effective.
 */
export async function isAssignedPolicy(
	accountability: Accountability,
	data: string | string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	cache: Cache | null,
): Promise<boolean> {
	return hasPolicies(accountability, data, services, schema, cache, null)
}

/**
 * Forwards authorization for one or more policies through an Express continuation.
 * Administrators bypass policy assignment resolution.
 * @param accountability - Directus accountability for the current request.
 * @param data - One or more policy IDs to require.
 * @param services - Directus API services.
 * @param schema - Current Directus schema used to construct AccessService.
 * @param cache - Initialized Redis policy cache, or null to disable caching.
 * @param next - Express continuation receiving an authorization error or no argument.
 * @returns Nothing.
 */
export async function requirePolicies(
	accountability: Accountability,
	data: string | string[],
	services: ApiExtensionContext['services'],
	schema: SchemaOverview,
	cache: Cache | null,
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
		const assigned = await isAssignedPolicy(accountability, data, services, schema, cache)
		if (assigned) next()
		else next(new ForbiddenError())
	} catch (error: unknown) {
		next(error)
	}
}
