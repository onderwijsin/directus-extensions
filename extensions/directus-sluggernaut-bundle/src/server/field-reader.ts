/**
 * @fileoverview Provides cached, validated Directus field metadata.
 *
 * Reads and caches the Directus field metadata used by Sluggernaut configuration discovery.
 *
 * The cache is scoped by collection and can be invalidated by schema mutation hooks. The reader
 * intentionally parses only the metadata contract Sluggernaut needs, allowing unrelated Directus
 * field properties to evolve independently.
 */
import type { ApiExtensionContext } from '@directus/types'

import { createAdminAccountability } from '@onderwijsin/directus-extension-utils'
import { initializeCache, withCache } from '@onderwijsin/directus-extension-utils/server'

import {
	fieldMetadataSchema,
	type SluggernautFieldMetadata,
} from '../shared/configuration/field-metadata.schema'

/**
 * Builds the cache key for one collection's field metadata.
 * @param collection - Directus collection key.
 * @returns The collection-scoped cache key.
 */
export const fieldsCacheKey = (collection: string): string => `sluggernaut:fields:${collection}`

export interface FieldReader {
	/** Reads parsed field metadata for one collection. */
	read(collection: string): Promise<SluggernautFieldMetadata[]>
	/** Clears all cached field metadata. */
	clearCache(): void
}

/**
 * Creates a field metadata reader with optional cache instance.
 * @param context - Directus extension context.
 * @param cacheOptions - Optional cache configuration. Omit to disable caching.
 * @returns A field metadata reader.
 */
export function createFieldReader(
	context: ApiExtensionContext,
	cacheOptions?: { ttl: number },
): FieldReader {
	const cache = cacheOptions ? initializeCache(context.env, { ttl: cacheOptions.ttl }) : null

	/**
	 * Reads and caches parsed field metadata for one collection.
	 * @param collection - Directus collection key.
	 * @returns Field metadata, potentially from cache.
	 */
	const read = (collection: string) =>
		withCache(
			{
				cache,
				key: fieldsCacheKey(collection),
			},
			async () => {
				const schema = await context.getSchema()
				const serviceOptions = {
					schema,
					accountability: createAdminAccountability(),
					...(context.database === undefined ? {} : { knex: context.database }),
				}
				const fieldsService = new context.services.FieldsService(serviceOptions)
				const result = await fieldsService.readAll(collection)
				return result.flatMap((field) => {
					const parsed = fieldMetadataSchema.safeParse(field)
					return parsed.success ? [parsed.data] : []
				})
			},
		)

	return {
		read,
		/**
		 * Clears all cached field metadata.
		 * @returns Nothing.
		 */
		clearCache: () => {
			if (!cache) return
			void cache.clear().catch((error: unknown) => {
				context.logger.error('Failed to clear Sluggernaut field cache.', { error })
			})
		},
	}
}
