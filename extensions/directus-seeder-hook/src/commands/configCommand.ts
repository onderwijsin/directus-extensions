import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { z } from 'zod'

import { envSchema } from '../env.schema'
import { getCollections, resolveSeederConfig } from '../seeders/resolveConfig'

/**
 * Registers read-only inspection of validated collection settings, independent of seed input.
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
		.description(
			'Show system and core collection configuration as JSON without seeding or extraction',
		)
		.option('--defaults', 'Show built-in defaults without consumer or environment overrides')
		.option('--collection <collection>', 'Show only the named collection')
		.action(async (input: unknown) => {
			let exitCode = 0
			try {
				const options = z
					.object({ defaults: z.boolean().optional(), collection: z.string().optional() })
					.parse(input)
				const config = resolveSeederConfig(
					options.defaults ? envSchema.parse({}) : context.env,
				)
				const effective = {
					system: getCollections({ ...config, dataScope: 'system' }),
					core: getCollections({ ...config, dataScope: 'core' }),
				}
				if (
					options.collection !== undefined &&
					!Object.values(effective)
						.flat()
						.some(({ collection }) => collection === options.collection)
				)
					throw new Error(`Unknown Seeder collection: "${options.collection}"`)
				const output = Object.fromEntries(
					Object.entries(effective).map(([scope, entries]) => {
						const collections = entries.filter(
							({ collection }) =>
								options.collection === undefined ||
								collection === options.collection,
						)
						return [
							scope,
							{
								order: collections.map(({ collection }) => collection),
								collections: Object.fromEntries(
									collections.map(({ collection, ...settings }) => [
										collection,
										settings,
									]),
								),
							},
						]
					}),
				)
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
