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
	/**
	 * Operation mode.
	 */
	operationMode: string

	/**
	 * Data scope.
	 */
	dataScope: DataScope

	/**
	 * Collections to include (if empty, include all).
	 */
	includeCollections?: unknown[]

	/**
	 * Collections to exclude.
	 */
	excludeCollections?: unknown[]

	/**
	 * Whether to continue on error.
	 */
	continueOnError?: boolean

	/**
	 * Batch size for operations.
	 */
	batchSize?: number

	/**
	 * Whether full-idempotent mode is enabled.
	 * This is a safety feature to prevent accidental data deletion.
	 */
	enableFullIdempotent?: boolean

	/**
	 * Whether to clear existing seed files before extraction.
	 */
	clearExistingSeeds?: boolean

	/**
	 * Whether to extract asset files to the assets folder.
	 */
	extractAssets?: boolean

	/** Indentation used when writing extracted JSON. */
	jsonIndent?: '\t' | 2 | 4

	/**
	 * Whether to automatically extract seed data from the current database state
	 * into seed files for system collections on data changes.
	 */
	autoExtract?: boolean
}
