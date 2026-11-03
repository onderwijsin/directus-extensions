import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { Option } from 'commander'
import { z } from 'zod'

import { acquireLock, releaseLock } from '../lib/processLock'
import { getFolderPaths, resolveSeederConfig } from '../lib/resolveConfig'
import { extractSystemData } from '../seeders/system/extract'

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
		.option('--skip-clean', 'Keep existing output before extracting selected data')
		.addOption(
			new Option('--json-only', 'Extract JSON without processing binary assets').conflicts(
				'assets',
			),
		)
		.addOption(
			new Option(
				'-a, --assets',
				'Extract binary assets, overriding SEEDER_JSON_ONLY',
			).conflicts('jsonOnly'),
		)
		.action(async (input: unknown) => {
			const options = z
				.object({
					include: z.array(z.string()).optional(),
					exclude: z.array(z.string()).optional(),
					skipClean: z.boolean().optional(),
					jsonOnly: z.boolean().optional(),
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
					skipClean: options.skipClean,
					jsonOnly: options.assets ? false : options.jsonOnly,
				})

				// Extract and write seed data
				await extractSystemData({
					...config,
					folders: {
						seeds: seedsFolder,
						assets: assetsFolder,
					},
					context,
				})

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
