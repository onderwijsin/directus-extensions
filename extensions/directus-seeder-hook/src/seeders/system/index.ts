import type { SeederConfig } from '../../lib/config'
import type { ServiceAdapterContext } from '../../services/ServiceAdapter'
import type { SeedResult } from '../../strategies/SeederStrategy'

import { createPerformanceTracker } from '../../lib/performanceTracker'
import { seedCollections } from '../../lib/seedCollections'
import { createSeedDataProvider } from '../../lib/seedDataParser'
import { SYSTEM_COLLECTIONS_ORDER } from './config'
import { getDataProviders } from './data'

/**
 * Seed system data
 *
 * @param context Directus hook context
 * @param config Seeder configuration
 * @returns Seeding results
 */
export async function seedSystem(
	context: ServiceAdapterContext,
	config: SeederConfig,
): Promise<SeedResult[]> {
	const { logger, env } = context
	const performanceTracker = createPerformanceTracker()
	const results: SeedResult[] = []

	logger.info(`Starting system data seeding with mode: ${config.operationMode}`)

	/**
	 * Create a seed data provider for system data
	 */
	const dataProviders = await getDataProviders(env)
	const systemDataProvider = createSeedDataProvider([...dataProviders])

	await performanceTracker.track('System data seeding', async () => {
		try {
			// Get seed data from a provider or parse from files
			const seedData = await performanceTracker.track('Get seed data', () =>
				Promise.resolve(systemDataProvider.getSeedData()),
			)

			// Seed collections using the helper function
			await seedCollections(
				seedData,
				config,
				context,
				SYSTEM_COLLECTIONS_ORDER,
				performanceTracker,
				results,
				'system',
			)

			return results
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error'
			logger.error(`Error seeding system data: ${message}`)
			throw error
		}
	})

	// Log performance data
	performanceTracker.outputFormatPerformanceData(logger)

	return results
}
