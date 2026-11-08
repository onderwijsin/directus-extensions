import type { ResolvedCollectionManagement } from '../lib/collectionManagement'
import type { PerformanceTracker } from '../lib/performanceTracker'
import type { SeedItem } from '../lib/seedItem'
import type { ServiceAdapter } from '../services/ServiceAdapter'

/**
 * Base interface for seeder strategies.
 */
export interface SeederStrategy {
	/**
	 * Seed data into a collection.
	 *
	 * @param collectionName Collection name
	 * @param data Data to seed
	 * @param serviceAdapter Service adapter for the collection
	 * @param performanceTracker Performance tracker
	 * @param management Optional boundary used only by full-idempotent
	 * @param primaryKey Resolved primary-key field; defaults to id for existing callers
	 * @param useSystemMetadata Whether system pass-two metadata is supported
	 * @returns Result of the seeding operation
	 */
	seedCollection: (
		collectionName: string,
		data: SeedItem[],
		serviceAdapter: ServiceAdapter,
		performanceTracker: PerformanceTracker,
		management?: ResolvedCollectionManagement,
		primaryKey?: string,
		useSystemMetadata?: boolean,
	) => Promise<SeedResult>
}

/**
 * Result of a seeding operation.
 */
export interface SeedResult {
	/**
	 * Collection name.
	 */
	collectionName: string

	/**
	 * Number of items created.
	 */
	created: number

	/**
	 * Number of items updated.
	 */
	updated: number

	/**
	 * Number of items deleted.
	 */
	deleted: number

	/**
	 * Number of items skipped.
	 */
	skipped: number

	/**
	 * Total number of items processed.
	 */
	total: number

	/**
	 * Duration in milliseconds.
	 */
	duration: number

	/**
	 * Error message if any.
	 */
	error?: string
}
