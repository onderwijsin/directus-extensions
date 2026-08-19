import type { Accountability } from '@directus/types'

import {
	hasKey,
	isArray,
	isBoolean,
	isRecord,
	isString,
} from '@onderwijsin/directus-extension-utils'

/**
 * Narrows an unknown value to Directus's required accountability shape and an authenticated user.
 * @param value - Runtime accountability value from a Directus request.
 * @returns Whether the value contains a complete accountability with a user.
 */
export function hasAuthenticatedUser(value: unknown): value is Accountability {
	if (!isRecord(value)) return false

	return (
		hasKey(value, 'role') &&
		(isString(value.role) || value.role === null) &&
		hasKey(value, 'roles') &&
		isArray(value.roles) &&
		value.roles.every(isString) &&
		hasKey(value, 'user') &&
		isString(value.user) &&
		hasKey(value, 'admin') &&
		isBoolean(value.admin) &&
		hasKey(value, 'app') &&
		isBoolean(value.app) &&
		hasKey(value, 'ip') &&
		(isString(value.ip) || value.ip === null)
	)
}
