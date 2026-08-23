import type { ApiExtensionContext } from '@directus/types'
import type { FieldReader } from '../../server/field-reader'

import { discoverCollectionConfiguration } from '../../shared/configuration/discovery'

/**
 * Reads and validates field configuration for one collection.
 * @param collection - Directus collection key.
 * @param fieldReader - Field Reader as FieldsService abstraction
 * @returns Parsed collection configuration.
 */
export async function getConfiguration(collection: string, fieldReader: FieldReader) {
	const fields = await fieldReader.read(collection)
	return discoverCollectionConfiguration(fields)
}

/**
 * Emits structured warnings for invalid or duplicate field configuration.
 * @param collection - Directus collection key.
 * @param configuration - Parsed collection configuration.
 * @param context - The Directus Context
 * @returns void
 */
export function logConfigurationWarnings(
	collection: string,
	configuration: ReturnType<typeof discoverCollectionConfiguration>,
	context: ApiExtensionContext,
) {
	for (const warning of configuration.warnings) {
		context.logger.warn(warning.message, {
			collection,
			field: warning.field,
			code: warning.code,
		})
	}
}
