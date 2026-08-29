import { createError } from '@directus/errors'

import { getDirectusStartupStatus, type DirectusStartupStatusOptions } from './operations/core'

/** Error constructor used when a schema change prevents a request. */
export type SchemaRejectionError = new () => Error

/** Error returned when schema changes are in progress. */
export const SchemaLockedError = createError(
	'ONGOING_SCHEMA_CHANGES',
	'There are schema changes in progress for the requested resource',
	503,
)

/** Error returned when the schema-change status cannot be determined. */
export const SchemaStatusError = createError(
	'SCHEMA_STATUS_FAILED',
	'Unable to determine whether schema changes are in progress',
	503,
)

/** Input for checking whether an endpoint should reject during schema startup. */
export interface RejectWhileSchemaLockedInput {
	id: string
	options?: DirectusStartupStatusOptions
	errors?: {
		locked?: SchemaRejectionError
		status?: SchemaRejectionError
	}
}

/**
 * Forwards an error when an extension's schema is being changed. If next is provided, it will be called with the error.
 * @param input - Extension identifier, startup status options, and optional error constructors.
 * @param next - Optional Express error handler continuation.
 * @returns Whether the request was rejected.
 */
export async function rejectWhileSchemaLocked(
	input: RejectWhileSchemaLockedInput,
	next?: (error?: unknown) => void,
): Promise<boolean> {
	try {
		const { isLocked } = await getDirectusStartupStatus({
			id: input.id,
			options: input.options,
		})
		if (!isLocked) return false

		next?.(new (input.errors?.locked ?? SchemaLockedError)())
		return true
	} catch {
		next?.(new (input.errors?.status ?? SchemaStatusError)())
		return true
	}
}
