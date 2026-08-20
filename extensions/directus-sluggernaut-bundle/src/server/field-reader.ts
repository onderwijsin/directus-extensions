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

import {
	initializeCache,
	withCache,
	type CacheEnv,
} from '@onderwijsin/directus-extension-utils/server'

import {
	fieldMetadataSchema,
	type SluggernautFieldMetadata,
} from '../shared/configuration/field-metadata.schema'

type Services = ApiExtensionContext['services']
type Database = ApiExtensionContext['database']

const FIELD_CACHE_KEY_PREFIX = 'sluggernaut:fields:'

export interface FieldCache {
	/** Reads parsed field metadata for one collection. */
	read(collection: string): Promise<SluggernautFieldMetadata[]>
	/** Removes one collection's cached field metadata. */
	clear(collection: string): Promise<void>
}

interface FieldReaderContext {
	services: Services
	getSchema: ApiExtensionContext['getSchema']
	database?: Database
}

/**
 * Creates a cached reader for one collection's Directus field metadata.
 * @param context - Directus services and schema access.
 * @param env - Directus cache environment values.
 * @param ttl - Cache duration in milliseconds.
 * @returns A collection-scoped field metadata cache.
 */
export function createFieldCache(
	context: FieldReaderContext,
	env: CacheEnv,
	ttl: number,
): FieldCache {
	const cache = initializeCache(env, { ttl })
	const readCachedFields = withCache(
		{ cache, namespace: FIELD_CACHE_KEY_PREFIX },
		async (collection: string) => {
			const schema = await context.getSchema()
			const serviceOptions = {
				schema,
				accountability: null,
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
		/**
		 * Reads field metadata for a collection.
		 * @param collection - Directus collection key.
		 * @returns Field metadata, potentially from cache.
		 */
		read: (collection) => readCachedFields(collection),
		/**
		 * Clears cached field metadata for one collection.
		 * @param collection - Directus collection key.
		 * @returns A promise that resolves after the cache is cleared.
		 */
		clear: (collection) => readCachedFields.clear(collection),
	}
}
