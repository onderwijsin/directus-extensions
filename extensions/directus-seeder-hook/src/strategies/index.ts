import type { CollectionManagement } from '../lib/collectionManagement'
import type { PerformanceTracker } from '../lib/performanceTracker'
import type { SeedItem } from '../lib/seedItem'
import type { ServiceAdapter } from '../services/ServiceAdapter'
import type { SeederStrategy, SeedResult } from './SeederStrategy'

import { z } from 'zod'

import { getIdRangeFilters, validateManagedSeedData } from '../lib/collectionManagement'
import { OperationMode } from '../lib/config'
import { toSeedRecord } from '../lib/seedItem'

const primaryKeysSchema = z.array(z.union([z.string(), z.number()]))

/**
 * Create a seed result object.
 *
 * @param collectionName Collection name
 * @param dataLength Total number of items
 * @returns An initialized seed result
 */
function createSeedResult(collectionName: string, dataLength: number): SeedResult {
	return {
		collectionName,
		created: 0,
		updated: 0,
		deleted: 0,
		skipped: 0,
		total: dataLength,
		duration: 0,
	}
}

/**
 * Execute a seed operation with performance tracking and error handling.
 *
 * @param collectionName Collection name
 * @param data Data to seed
 * @param operation The operation function to execute
 * @returns Seed result
 */
async function executeSeedOperation(
	collectionName: string,
	data: SeedItem[],
	operation: (result: SeedResult) => Promise<void>,
): Promise<SeedResult> {
	const result = createSeedResult(collectionName, data.length)
	const startTime = performance.now()

	try {
		await operation(result)
	} catch (error) {
		result.error = error instanceof Error ? error.message : 'Unknown error'
	}

	const endTime = performance.now()
	result.duration = endTime - startTime

	return result
}

/**
 * Process items in batches with common operations.
 *
 * @param batch Batch of items to process
 * @param serviceAdapter Service adapter
 * @param performanceTracker Performance tracker
 * @param result Seed result to update
 * @param updateExisting Whether to update existing items
 * @returns Resolves after the batch is processed.
 */
async function processBatch(
	batch: SeedItem[],
	serviceAdapter: ServiceAdapter,
	performanceTracker: PerformanceTracker,
	result: SeedResult,
	updateExisting = false,
): Promise<void> {
	// Extract IDs from the batch
	const batchIds = batch
		.map((item) => toSeedRecord(item).id)
		.filter((id) => id !== undefined && id !== null)

	if (batchIds.length === 0) {
		// If no IDs in the batch, create all items
		const createdItems = await serviceAdapter.createItems(batch)
		result.created += createdItems.length
		return
	}

	// If we're allowed to update existing items, use upsert, which is more efficient
	if (updateExisting) {
		// Since we don't know which items are going to be created or updated,
		// we need to query to find out
		const existingItems = await performanceTracker.track(
			'Find existing items for counting',
			() =>
				serviceAdapter.getItems({
					filter: { id: { _in: batchIds } },
					fields: ['id'],
					limit: -1,
				}),
		)

		const existingIds = new Set(
			existingItems.map((item) => {
				if (typeof item === 'object' && item !== null && 'id' in item) {
					return toSeedRecord(item).id
				}
				return item
			}),
		)

		await performanceTracker.track(`Upsert ${batch.length} items`, () =>
			serviceAdapter.upsertItems(batch),
		)

		// Count created and updated items for reporting
		const createdCount = batch.filter(
			(item) =>
				toSeedRecord(item).id !== undefined && !existingIds.has(toSeedRecord(item).id),
		).length
		const updatedCount = batch.length - createdCount

		result.created += createdCount
		result.updated += updatedCount
		return
	}

	const existingItems = await performanceTracker.track('Find existing items', () =>
		serviceAdapter.getItems({
			filter: { id: { _in: batchIds } },
			fields: ['id'],
			limit: -1,
		}),
	)

	// Create a set of existing IDs for fast lookup
	const existingIds = new Set(
		existingItems.map((item) => {
			if (typeof item === 'object' && item !== null && 'id' in item) {
				return toSeedRecord(item).id
			}
			return item
		}),
	)

	// Filter to only create items that don't exist
	const itemsToCreate = batch.filter(
		(item) => toSeedRecord(item).id !== undefined && !existingIds.has(toSeedRecord(item).id),
	)

	// Separate items into full create vs update-only items
	// Update-only items are explicitly marked with __isUpdateOnly metadata
	// and are used for multi-pass imports (e.g., directus_operations)
	const fullItems: typeof itemsToCreate = []
	const updateOnlyItems: typeof itemsToCreate = []

	for (const item of itemsToCreate) {
		// Check if the item is marked as update-only
		const itemWithMeta = toSeedRecord(item)
		const isUpdateOnly =
			'__isUpdateOnly' in itemWithMeta && itemWithMeta.__isUpdateOnly === true

		if (isUpdateOnly) {
			// Remove the metadata field before processing
			const { __isUpdateOnly: _, ...cleanItem } = itemWithMeta
			updateOnlyItems.push(cleanItem)
		} else {
			fullItems.push(item)
		}
	}

	// Create full items using createItems
	if (fullItems.length > 0) {
		const createdItems = await performanceTracker.track(
			`Create ${fullItems.length} items`,
			() => serviceAdapter.createItems(fullItems),
		)
		result.created += createdItems.length
	}

	// Update-only items use upsert to update existing records
	// These items have minimal fields and are used in multi-pass imports
	if (updateOnlyItems.length > 0) {
		const upsertedItems = await performanceTracker.track(
			`Update ${updateOnlyItems.length} items (pass 2)`,
			() => serviceAdapter.upsertItems(updateOnlyItems),
		)
		// These are updates to existing items, not new creations
		result.updated += upsertedItems.length
	}

	// Count skipped items
	result.skipped += batch.length - itemsToCreate.length
}

/**
 * Create an insert missing strategy.
 *
 * @param batchSize Batch size for operations
 * @returns Seeder strategy
 */
function createInsertMissingStrategy(batchSize = 50): SeederStrategy {
	return {
		/**
		 * Seeds one collection using the selected operation mode.
		 * @param collectionName - Collection to seed.
		 * @param data - Original seed rows.
		 * @param serviceAdapter - Directus service operations.
		 * @param performanceTracker - Operation timing tracker.
		 * @returns Counts, duration, and any captured mutation error.
		 */
		seedCollection: async (
			collectionName: string,
			data: SeedItem[],
			serviceAdapter: ServiceAdapter,
			performanceTracker: PerformanceTracker,
		) => {
			// Ensure data has id fields for this strategy
			const dataWithIds = data

			return executeSeedOperation(collectionName, data, async (result) => {
				// Process data in batches
				const batches = createBatches(dataWithIds, batchSize)

				for (const batch of batches) {
					await performanceTracker.track(
						`Process batch of ${batch.length} items for ${collectionName}`,
						async () => {
							await processBatch(
								batch,
								serviceAdapter,
								performanceTracker,
								result,
								false,
							)
						},
					)
				}
			})
		},
	}
}

/**
 * Create an insert update strategy.
 *
 * @param batchSize Batch size for operations
 * @returns Seeder strategy
 */
function createInsertUpdateStrategy(batchSize = 50): SeederStrategy {
	return {
		/**
		 * Seeds one collection using the selected operation mode.
		 * @param collectionName - Collection to seed.
		 * @param data - Original seed rows.
		 * @param serviceAdapter - Directus service operations.
		 * @param performanceTracker - Operation timing tracker.
		 * @returns Counts, duration, and any captured mutation error.
		 */
		seedCollection: async (
			collectionName: string,
			data: SeedItem[],
			serviceAdapter: ServiceAdapter,
			performanceTracker: PerformanceTracker,
		) => {
			// Ensure data has id fields for this strategy
			const dataWithIds = data

			return executeSeedOperation(collectionName, data, async (result) => {
				// Process data in batches
				const batches = createBatches(dataWithIds, batchSize)

				for (const batch of batches) {
					await performanceTracker.track(
						`Process batch of ${batch.length} items for ${collectionName}`,
						async () => {
							await processBatch(
								batch,
								serviceAdapter,
								performanceTracker,
								result,
								true,
							)
						},
					)
				}
			})
		},
	}
}

/**
 * Create a full-idempotent strategy.
 *
 * @param batchSize Batch size for operations
 * @returns Seeder strategy
 */
function createFullIdempotentStrategy(batchSize = 50): SeederStrategy {
	return {
		/**
		 * Seeds one collection using the selected operation mode.
		 * @param collectionName - Collection to seed.
		 * @param data - Original seed rows.
		 * @param serviceAdapter - Directus service operations.
		 * @param performanceTracker - Operation timing tracker.
		 * @param management - Optional numeric management boundary.
		 * @returns Counts, duration, and any captured mutation error.
		 */
		seedCollection: async (
			collectionName: string,
			data: SeedItem[],
			serviceAdapter: ServiceAdapter,
			performanceTracker: PerformanceTracker,
			management?: CollectionManagement,
		) => {
			// Ensure data has id fields for this strategy
			const dataWithIds = data

			return executeSeedOperation(collectionName, data, async (result) => {
				const range = validateManagedSeedData(collectionName, data, management)
				// Get all seed data IDs
				const seedDataIds = new Set(
					dataWithIds
						.map((item) => toSeedRecord(item).id)
						.filter((id) => id !== undefined && id !== null),
				)

				// Process data in batches
				const batches = createBatches(dataWithIds, batchSize)

				for (const batch of batches) {
					await performanceTracker.track(
						`Process batch of ${batch.length} items for ${collectionName}`,
						async () => {
							await processBatch(
								batch,
								serviceAdapter,
								performanceTracker,
								result,
								true,
							)
						},
					)
				}

				// Find and delete items that are not in the seed data
				await performanceTracker.track(`  Delete extra items`, async () => {
					// Get all the IDs of the existing items that are not in the seed data
					const allExistingItems = await serviceAdapter.getItems({
						fields: ['id'],
						filter:
							range === undefined
								? { id: { _nin: [...seedDataIds] } }
								: {
										_and: [
											...getIdRangeFilters(range),
											// Bounded empty seeds need only the range; never rely on _nin: [].
											...(seedDataIds.size === 0
												? []
												: [{ id: { _nin: [...seedDataIds] } }]),
										],
									},
						limit: -1,
					})

					// Prepare the IDs that are in the database but not in the seed data
					const idsToDelete = allExistingItems.map((item) => {
						if (typeof item === 'object' && item !== null && 'id' in item) {
							return toSeedRecord(item).id
						}
						return item
					})

					if (idsToDelete.length > 0) {
						// Delete items in batches
						const deleteBatches = createBatches(idsToDelete, batchSize)

						for (const deleteBatch of deleteBatches) {
							const deletedItems = await performanceTracker.track(
								`Delete ${deleteBatch.length} items`,
								() =>
									serviceAdapter.deleteItems(
										primaryKeysSchema.parse(deleteBatch),
									),
							)
							result.deleted += deletedItems.length
						}
					}
				})
			})
		},
	}
}

/**
 * Create batches from data.
 *
 * @param data Data to batch
 * @param batchSize Batch size
 * @returns Batches
 */
function createBatches<T>(data: T[], batchSize: number): T[][] {
	const batches: T[][] = []

	for (let count = 0; count < data.length; count += batchSize) {
		batches.push(data.slice(count, count + batchSize))
	}

	return batches
}

/**
 * Create a seeder strategy based on the operation mode.
 *
 * @param operationMode Operation mode
 * @param batchSize Batch size for operations
 * @returns Seeder strategy
 */
export function createSeederStrategy(operationMode: string, batchSize = 50): SeederStrategy {
	if (operationMode === OperationMode.INSERT_MISSING) {
		return createInsertMissingStrategy(batchSize)
	}

	if (operationMode === OperationMode.INSERT_UPDATE) {
		return createInsertUpdateStrategy(batchSize)
	}

	if (operationMode === OperationMode.FULL_IDEMPOTENT) {
		return createFullIdempotentStrategy(batchSize)
	}

	throw new Error(`Unknown operation mode: ${String(operationMode)}`)
}
