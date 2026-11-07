import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { z } from 'zod'

import { envSchema } from '../env.schema'
import { resolveSeederConfig } from '../lib/resolveConfig'
import { getSystemCollections } from '../seeders/system/resolveConfig'

/**
 * Registers read-only inspection of validated system settings, independent of seed input.
 * @param parentCommand - Seeder command namespace.
 * @param context - Validated Directus runtime options.
 * @returns Nothing.
 */
export function registerConfigCommand(
	parentCommand: Command,
	context: Pick<ServiceAdapterContext, 'env'>,
): void {
	parentCommand
		.command('config')
		.description('Show system collection configuration as JSON without seeding or extraction')
		.option('--defaults', 'Show built-in defaults without consumer or environment overrides')
		.option('--collection <collection>', 'Show only the named system collection')
		.action(async (input: unknown) => {
			let exitCode = 0
			try {
				const options = z
					.object({ defaults: z.boolean().optional(), collection: z.string().optional() })
					.parse(input)
				const config = resolveSeederConfig(
					options.defaults ? envSchema.parse({}) : context.env,
				)
				const collections = getSystemCollections(config).filter(
					({ collection }) =>
						options.collection === undefined || collection === options.collection,
				)
				if (options.collection !== undefined && collections.length === 0)
					throw new Error(`Unknown system collection: "${options.collection}"`)

				const output = {
					system: {
						order: collections.map(({ collection }) => collection),
						collections: Object.fromEntries(
							collections.map((entry) => {
								const { collection, ...settings } = entry
								return [collection, settings]
							}),
						),
					},
				}
				await new Promise<void>((resolve, reject) => {
					process.stdout.write(
						`${JSON.stringify(output, null, 2)}\n`,
						'utf8',
						(error) => {
							if (error) reject(error)
							else resolve()
						},
					)
				})
			} catch (error) {
				console.error(
					`Failed to inspect Seeder configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
				)
				exitCode = 1
			} finally {
				process.exit(exitCode)
			}
		})
}
