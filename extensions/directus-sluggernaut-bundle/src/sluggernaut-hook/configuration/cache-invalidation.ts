import type { HookExtensionContext, RegisterFunctions } from '@directus/types'
import type { FieldCache } from '../../server/field-reader'

import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

const SCHEMA_CACHE_INVALIDATION_EVENTS = [
	'fields.create',
	'fields.update',
	'fields.delete',
] as const

/**
 * Registers collection-scoped field-cache invalidation for schema mutations.
 * @param action - Directus action registration function.
 * @param fieldCache - Collection-scoped field metadata cache.
 * @param logger - Extension logger.
 * @returns Nothing.
 */
export function registerFieldCacheInvalidation(
	action: RegisterFunctions['action'],
	fieldCache: FieldCache,
	logger: HookExtensionContext['logger'],
): void {
	for (const event of SCHEMA_CACHE_INVALIDATION_EVENTS) {
		action(event, (meta) => {
			const collection = isRecord(meta) ? meta.collection : undefined
			if (!isString(collection)) return

			void fieldCache.clear(collection).catch((error: unknown) => {
				logger.error('Sluggernaut failed to clear field metadata cache.', {
					collection,
					error,
				})
			})
		})
	}
}
