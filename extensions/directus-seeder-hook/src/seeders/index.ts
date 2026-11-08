import type { SeederConfig } from '../lib/config'
import type { CollectionDataProvider } from '../lib/seedDataParser'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'
import type { SeedResult } from '../strategies/SeederStrategy'

import { createPerformanceTracker } from '../lib/performanceTracker'
import { seedCollections } from '../lib/seedCollections'
import { createSeedDataProvider } from '../lib/seedDataParser'
import { getCollections, getFolderPaths } from './resolveConfig'
import { prepareCompatibleSystemData } from './system/compatibility'

/**
 * Imports previously loaded data through the existing engine for the selected scope.
 *
 * @param context Directus hook context
 * @param config Seeder configuration
 * @param dataProviders Selected input loaded and validated before CLI confirmation
 * @param fullReset Whether this import deliberately ignores management boundaries
 * @returns Seeding results, or null when no selected seed files exist
 */
export async function seed(
	context: ServiceAdapterContext,
	config: SeederConfig,
	dataProviders: CollectionDataProvider[] | null,
	fullReset = false,
): Promise<SeedResult[] | null> {
	const { logger, env } = context
	const performanceTracker = createPerformanceTracker()
	const results: SeedResult[] = []

	logger.info(`Starting ${config.dataScope} data seeding`)

	const collections = getCollections(config)
	if (dataProviders === null || dataProviders.length === 0) {
		const { seedsFolder } = getFolderPaths(env, config.dataScope)
		logger.warn(
			`No selected ${config.dataScope} seed files found in "${seedsFolder}"; skipping seeding`,
		)
		return null
	}
	const dataProvider = createSeedDataProvider([...dataProviders])

	await performanceTracker.track(`${config.dataScope} data seeding`, async () => {
		try {
			// Get seed data from a provider or parse from files
			let seedData = await performanceTracker.track('Get seed data', () =>
				Promise.resolve(dataProvider.getSeedData()),
			)
			if (
				config.dataScope === 'system' &&
				('directus_folders' in seedData || 'directus_flows' in seedData)
			) {
				seedData = prepareCompatibleSystemData(seedData, await context.getSchema())
			}

			// Seed collections using the helper function
			await seedCollections(
				seedData,
				config,
				context,
				collections,
				performanceTracker,
				results,
				config.dataScope,
				fullReset,
			)

			return results
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			logger.error(`Error seeding ${config.dataScope} data: ${message}`)
			throw error
		}
	})

	// Log performance data
	performanceTracker.outputFormatPerformanceData(logger)

	return results
}
