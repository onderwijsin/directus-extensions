import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { z } from 'zod'

import { acquireLock, releaseLock } from '../lib/processLock'
import { getFolderPaths, resolveSeederConfig } from '../lib/resolveConfig'
import { extractAssets, extractSeedsFromCollections } from '../seeders/system/extract'

/**
 * Registers the extract command for extracting seed data from the current Directus instance.
 *
 * @param parentCommand - The parent command to register this command under
 * @param context - The Directus hook extension context
 * @returns Nothing.
 */
export const registerExtractCommand = (
	parentCommand: Command,
	context: ServiceAdapterContext,
): void => {
	const { logger, env } = context
	const { seedsFolder, assetsFolder } = getFolderPaths(env)

	parentCommand
		.command('extract')
		.description('Extract seed data from the current Directus instance')
		.option('-i, --include <collections...>', 'Space-separated collection names to include')
		.option('-e, --exclude <collections...>', 'Space-separated collection names to exclude')
		.option('-c, --clear', 'Clear existing seed files before extraction')
		.option('-a, --assets', 'Extract asset files to assets folder')
		.action(async (input: unknown) => {
			const options = z
				.object({
					include: z.array(z.string()).optional(),
					exclude: z.array(z.string()).optional(),
					clear: z.boolean().optional(),
					assets: z.boolean().optional(),
				})
				.parse(input)
			let exitCode = 0

			try {
				// Acquire lock to signal other extensions that a bulk operation is in progress
				acquireLock()
				logger.info('🌱 Extracting seed data from Directus using Directus Seeder...')

				// Apply explicit CLI overrides to the validated startup options
				const config = resolveSeederConfig(env, {
					includeCollections: options.include,
					excludeCollections: options.exclude,
					clearExistingSeeds: options.clear,
					extractAssets: options.assets,
				})

				// Extract and write seed data
				await extractSeedsFromCollections({
					...config,
					folders: {
						seeds: seedsFolder,
						assets: assetsFolder,
					},
					context,
				})

				// Download and write asset files if needed
				if (config.extractAssets) {
					await extractAssets({
						...config,
						folders: {
							seeds: seedsFolder,
							assets: assetsFolder,
						},
						context,
					})
				}

				logger.info('✅ Seed data successfully extracted!')
				exitCode = 0
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error'
				logger.error(`❌ Failed to extract seed data: ${message}`)
				logger.error(error)
				exitCode = 1
			} finally {
				// Always release the lock
				const released = releaseLock()
				if (released) {
					logger.trace('🧹 Released process lock')
				}

				process.exit(exitCode)
			}
		})
}
