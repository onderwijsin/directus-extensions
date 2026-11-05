import type { ServiceAdapterContext } from '../services/ServiceAdapter'
import type { SeedResult } from '../strategies/SeederStrategy'
import type { CollectionConfig, SeederConfig } from './config'
import type { PerformanceTracker } from './performanceTracker'
import type { SeedData } from './seedDataParser'

import { createFilesServiceAdapter } from '../services/FilesServiceAdapter'
import { createItemsServiceAdapter } from '../services/ItemsServiceAdapter'
import { createSeederStrategy } from '../strategies'
import { validateManagedSeedData } from './collectionManagement'
import { OperationMode, selectCollections } from './config'

/**
 * Helper function to seed collections with common logic.
 *
 * @param seedData The data to be seeded
 * @param config Seeder configuration
 * @param context Service adapter context
 * @param collectionConfigs Internal collection settings in dependency order
 * @param performanceTracker Performance tracker instance
 * @param results Array to store results
 * @param collectionType Optional string to identify the type of collections (e.g., "development", "system")
 * @returns Updated results array
 */
export async function seedCollections(
	seedData: SeedData,
	config: SeederConfig,
	context: ServiceAdapterContext,
	collectionConfigs: CollectionConfig[],
	performanceTracker: PerformanceTracker,
	results: SeedResult[],
	collectionType = '',
): Promise<SeedResult[]> {
	const { logger } = context

	// Create seeder strategy
	const strategy = createSeederStrategy(config.operationMode, config.batchSize)

	// Get collections to seed
	const collectionsToSeed = selectCollections(Object.keys(seedData), config)
	const collectionsOrder = collectionConfigs.map(({ collection }) => collection)

	// Preflight every selected collection before any service can mutate the database.
	if (config.operationMode === OperationMode.FULL_IDEMPOTENT) {
		for (const collectionName of collectionsToSeed) {
			validateManagedSeedData(
				collectionName,
				seedData[collectionName] ?? [],
				collectionConfigs.find(({ collection }) => collection === collectionName)
					?.management,
			)
		}
	}

	// Filter collections based on include/exclude lists
	if (config.includeCollections && config.includeCollections.length > 0) {
		logger.info(`Including collections: ${config.includeCollections.join(', ')}`)
	}

	if (config.excludeCollections && config.excludeCollections.length > 0) {
		logger.info(`Excluding collections: ${config.excludeCollections.join(', ')}`)
	}

	// Sort collections to ensure proper order
	collectionsToSeed.sort((a, b) => {
		const aIndex = collectionsOrder.indexOf(a)
		const bIndex = collectionsOrder.indexOf(b)

		if (aIndex === -1 && bIndex === -1) return 0
		if (aIndex === -1) return 1
		if (bIndex === -1) return -1
		return aIndex - bIndex
	})

	const typeLabel = collectionType ? `${collectionType} ` : ''

	logger.info(
		`Seeding ${collectionsToSeed.length} ${typeLabel}collections: ${collectionsToSeed.join(', ')}`,
	)

	// Seed each collection
	for (const collectionName of collectionsToSeed) {
		const collectionData = seedData[collectionName] ?? []

		logger.debug(`Seeding collection: ${collectionName} (${collectionData.length} items)`)

		let result: SeedResult
		try {
			// Create the appropriate service adapter
			const serviceAdapter =
				collectionName === 'directus_files'
					? await createFilesServiceAdapter(context)
					: await createItemsServiceAdapter(collectionName, context)

			// Seed the collection
			result = await strategy.seedCollection(
				collectionName,
				collectionData,
				serviceAdapter,
				performanceTracker,
				collectionConfigs.find(({ collection }) => collection === collectionName)
					?.management,
			)
		} catch (error) {
			result = {
				collectionName,
				created: 0,
				updated: 0,
				deleted: 0,
				skipped: 0,
				total: collectionData.length,
				duration: 0,
				error: error instanceof Error ? error.message : 'Unknown error',
			}
		}

		results.push(result)

		if (result.error !== undefined) {
			logger.error(`Error seeding collection ${collectionName}: ${result.error}`)
			if (!config.continueOnError) break
		} else {
			logger.info(
				`Seeded ${collectionName}: ` +
					`${result.created} created, ` +
					`${result.updated} updated, ` +
					`${result.deleted} deleted, ` +
					`${result.skipped} skipped, ` +
					`${result.duration.toFixed(2)} ms`,
			)
		}
	}

	return results
}
