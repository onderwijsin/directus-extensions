import type { Accountability } from '@directus/types'
import type { Request } from 'express'

import {
	hasKey,
	isArray,
	isBoolean,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'

/**
 * Checks whether a value appears to be a Directus accountability object.
 *
 * This is a structural type guard, not full runtime validation.
 *
 * @param value - Value to inspect.
 * @returns Whether the value appears to be an Accountability object.
 */
export function isAccountability(value: unknown): value is Accountability {
	if (!isRecord(value)) return false

	return (
		hasKey(value, 'admin') &&
		isBoolean(value.admin) &&
		hasKey(value, 'app') &&
		isBoolean(value.app) &&
		hasKey(value, 'roles') &&
		isArray(value.roles) &&
		hasKey(value, 'user') &&
		(value.user === null || isString(value.user))
	)
}

/**
 * Narrows an unknown value to Directus's required accountability shape and an authenticated user.
 * @param value - Runtime accountability value from a Directus request.
 * @returns Whether the value contains a complete accountability with a user.
 */
export function hasAuthenticatedUser(value: unknown): value is Accountability & { user: string } {
	if (!isAccountability(value)) return false
	return isString(value.user)
}

/**
 * Asserts that a Express Request object contains a valid accountability property
 * @param request - The Express Request object
 * @returns boolean indicating whether request.accountability is of type Accountability
 */
export function assertRequestWithAccountability(
	request: Request,
): request is Request & { accountability: Accountability } {
	const accountability = hasKey(request, 'accountability') ? request.accountability : null
	return isAccountability(accountability)
}

/**
 * Reads accountability without changing the inferred Express request type.
 *
 * @param request - The inferred Directus endpoint request.
 * @returns The request accountability, or null when it is absent or malformed.
 */
export function getAccountabilityFromRequest(request: Request): Accountability | null {
	const accountability = Reflect.get(request, 'accountability')
	return isAccountability(accountability) ? accountability : null
}
