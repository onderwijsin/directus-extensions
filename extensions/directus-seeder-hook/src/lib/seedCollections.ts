import type { ServiceAdapterContext } from '../services/ServiceAdapter'
import type { SeedResult } from '../strategies/SeederStrategy'
import type { ResolvedCollectionManagement } from './collectionManagement'
import type { CollectionConfig, SeederConfig } from './config'
import type { PerformanceTracker } from './performanceTracker'
import type { SeedData } from './seedDataParser'

import { createFilesServiceAdapter } from '../services/FilesServiceAdapter'
import { createItemsServiceAdapter } from '../services/ItemsServiceAdapter'
import { createSeederStrategy } from '../strategies'
import { validateManagedSeedData } from './collectionManagement'
import { OperationMode, selectCollections } from './config'
import { getManifestSeedIds } from './manifestManagement'
import { getFolderPaths } from './resolveConfig'
import { resolveCollectionManagement, validateRelationSeedKeys } from './resolveManagement'
import { toSeedRecord } from './seedItem'

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
 * @param fullReset Whether this import deliberately ignores management boundaries
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
	fullReset = false,
): Promise<SeedResult[]> {
	const { logger } = context

	// Get collections to seed
	const collectionsToSeed = selectCollections(Object.keys(seedData), config)
	const collectionsOrder = collectionConfigs.map(({ collection }) => collection)

	const boundaries = new Map<string, ResolvedCollectionManagement>()
	// Preflight every selected collection before any service can mutate the database.
	for (const collectionName of collectionsToSeed) {
		const collection = collectionConfigs.find((entry) => entry.collection === collectionName)
		if (!collection) throw new Error(`Missing configuration for collection "${collectionName}"`)
		const mode = collection.operationMode
		if (fullReset && mode !== OperationMode.FULL_IDEMPOTENT) {
			throw new Error(
				`--full-reset requires full-idempotent mode for collection "${collectionName}"`,
			)
		}
		if (mode !== OperationMode.FULL_IDEMPOTENT) continue
		if (!config.enableFullIdempotent) {
			throw new Error(
				'full-idempotent mode is disabled for safety. Set SEEDER_ENABLE_FULL_IDEMPOTENT=true to enable this destructive operation.',
			)
		}
		// Reuse the existing whole-collection strategy without resolving management inputs.
		if (fullReset) continue
		let management: ResolvedCollectionManagement | undefined
		const data = seedData[collectionName] ?? []
		if (
			collection.management?.type === 'relation' ||
			collection.management?.type === 'manifest'
		) {
			const schema = await context.getSchema()
			management = await resolveCollectionManagement(
				collectionName,
				collection.management,
				getFolderPaths(context.env).seedsFolder,
				schema,
			)
			if (collection.management.type === 'manifest') {
				getManifestSeedIds(collectionName, data, schema)
			} else {
				validateRelationSeedKeys(collectionName, data, schema)
			}
		} else {
			management = collection.management
		}
		management = validateManagedSeedData(collectionName, data, management)
		if (management) boundaries.set(collectionName, management)
	}

	// A seed ID must not upsert an existing record that belongs to an unmanaged parent.
	// Read every collision before any collection starts mutating, even with continueOnError.
	for (const collectionName of collectionsToSeed) {
		const management = boundaries.get(collectionName)
		const data = seedData[collectionName] ?? []
		if (management?.type !== 'relation' || data.length === 0) continue
		const adapter = await createItemsServiceAdapter(collectionName, context)
		const ids = data.map((row) => {
			return toSeedRecord(row).id
		})
		const existing = await adapter.getItems({
			fields: ['id', management.field],
			filter: { id: { _in: ids } },
			limit: -1,
		})
		validateManagedSeedData(collectionName, existing, management)
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
		const collection = collectionConfigs.find((entry) => entry.collection === collectionName)
		if (!collection) throw new Error(`Missing configuration for collection "${collectionName}"`)
		const strategy = createSeederStrategy(collection.operationMode, config.batchSize)

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
				boundaries.get(collectionName),
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
