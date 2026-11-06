import type { SystemCollectionConfig } from '../seeders/system/config.schema'
import type { CollectionManagement } from './collectionManagement'

/**
 * Configuration types for the Directus Seeder extension.
 */

/**
 * Operation modes for the seeder.
 */
export const OperationMode = {
	/**
	 * Only add records that don't exist yet.
	 */
	INSERT_MISSING: 'insert-missing',

	/**
	 * Add missing records and update existing ones.
	 */
	INSERT_UPDATE: 'insert-update',

	/**
	 * Add missing, update existing, and remove records not in seed data.
	 */
	FULL_IDEMPOTENT: 'full-idempotent',
} satisfies Record<string, 'insert-missing' | 'insert-update' | 'full-idempotent'>

/**
 * Operation mode type.
 */
export type OperationMode = (typeof OperationMode)[keyof typeof OperationMode]

/**
 * Data scopes for the seeder.
 */
export const DataScope = {
	/**
	 * Essential system data (roles, permissions, settings).
	 */
	SYSTEM: 'system',
} satisfies Record<string, 'system'>

/**
 * Data scope type
 */
export type DataScope = (typeof DataScope)[keyof typeof DataScope]

/**
 * Configuration for the seeder.
 */
export interface SeederConfig {
	/** Effective system collection settings, including explicit CLI mode overrides. */
	systemCollections?: SystemCollectionConfig[]

	/** Collections with explicit consumer fields, which bypass default-field compatibility. */
	systemFieldOverrides?: string[]

	/**
	 * Operation mode.
	 */
	operationMode: OperationMode

	/**
	 * Data scope.
	 */
	dataScope: DataScope

	/**
	 * Collections to include (if empty, include all).
	 */
	includeCollections: string[]

	/**
	 * Collections to exclude.
	 */
	excludeCollections: string[]

	/**
	 * Whether to continue on error.
	 */
	continueOnError: boolean

	/**
	 * Batch size for operations.
	 */
	batchSize: number

	/**
	 * Whether full-idempotent mode is enabled.
	 * This is a safety feature to prevent accidental data deletion.
	 */
	enableFullIdempotent: boolean

	/**
	 * Whether to skip the default cleanup before extraction.
	 */
	skipClean: boolean

	/**
	 * Whether to extract JSON without reading, downloading, or cleaning binary assets.
	 */
	jsonOnly: boolean

	/** Indentation used when writing extracted JSON. */
	jsonIndent: '\t' | number

	/**
	 * Whether to automatically extract seed data from the current database state
	 * into seed files for system collections on data changes.
	 */
	autoExtract: boolean
}

/** Internal collection settings shared by data scopes. */
export interface CollectionConfig {
	/** Collection to synchronize. */
	collection: string
	/** Optional per-collection import mode, before the global fallback. */
	operationMode?: OperationMode
	/** Optional full-idempotent boundary, independent of extraction filters. */
	management?: CollectionManagement
}

/**
 * Applies the resolved collection selection, with exclusions taking precedence.
 * @param collections - Available collection names in their existing order.
 * @param config - Resolved include and exclude settings.
 * @returns Selected collection names without changing their order.
 */
export function selectCollections(
	collections: string[],
	config: Pick<SeederConfig, 'includeCollections' | 'excludeCollections'>,
): string[] {
	return collections.filter(
		(collection) =>
			(config.includeCollections.length === 0 ||
				config.includeCollections.includes(collection)) &&
			!config.excludeCollections.includes(collection),
	)
}

/**
 * Resolves a collection's mode after explicit CLI overrides have been applied.
 * @param collection - Effective collection settings.
 * @param config - Global runtime settings.
 * @returns Collection mode or global fallback.
 */
export function getCollectionMode(
	collection: CollectionConfig,
	config: SeederConfig,
): OperationMode {
	return collection.operationMode ?? config.operationMode
}
