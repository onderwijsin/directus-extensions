import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { FieldReader } from '../../server/field-reader'

const SCHEMA_CACHE_INVALIDATION_EVENTS: string[] = [
	'fields.create',
	'fields.update',
	'fields.delete',
]

/**
 * Registers collection-scoped field-cache invalidation for schema mutations.
 * @param hook - Directus hook registration functions.
 * @param fieldReader - Field metadata reader and cache owner.
 * @returns Nothing.
 */
export function registerFieldCacheInvalidation(
	hook: RegisterFunctions,
	fieldReader: FieldReader,
): void {
	for (const event of SCHEMA_CACHE_INVALIDATION_EVENTS) {
		hook.action(event, () => fieldReader.clearCache())
	}
}
