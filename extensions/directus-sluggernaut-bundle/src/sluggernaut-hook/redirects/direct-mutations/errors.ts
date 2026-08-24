import { isDirectusError } from '@directus/errors'

import { sluggernautValidationError } from '../../../shared/errors'

/**
 * Translates a domain or persistence failure to a Directus payload error.
 * @param error - Failure raised by validation or persistence.
 * @param collection - Configured redirect collection.
 * @returns A Directus invalid-payload error.
 */
export function mutationError(error: unknown, collection: string): Error {
	if (isDirectusError(error)) return error
	const message = error instanceof Error ? error.message : 'Unknown redirect validation failure.'
	return sluggernautValidationError(
		`Redirect mutation in "${collection}" was rejected: ${message}`,
	)
}
