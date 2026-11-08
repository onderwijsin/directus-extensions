import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { z } from 'zod'

import { DataScope, OperationMode, selectCollections } from '../lib/config'
import { confirmExplicit, confirmYesNo, shouldSkipConfirmation } from '../lib/confirmationPrompts'
import { acquireLock } from '../lib/processLock'
import { resolveSeederConfig } from '../lib/resolveConfig'
import { seedSystem } from '../seeders/system'
import { getDataProviders } from '../seeders/system/data'
import { getCollections } from '../seeders/system/resolveConfig'

/**
 * Registers the system command for seeding Directus with essential system data.
 *
 * @param parentCommand - The parent command to register this command under
 * @param context - The Directus hook extension context
 * @param scope - Data scope to import using the shared command and safety flow.
 * @returns Nothing.
 */
export const registerSystemCommand = (
	parentCommand: Command,
	context: ServiceAdapterContext,
	scope: DataScope = DataScope.SYSTEM,
): void => {
	const { logger, env, services, getSchema } = context

	parentCommand
		.command(scope)
		.description(`Seed Directus with configured ${scope} data`)
		.option(
			'-m, --mode <mode>',
			'Operation mode: insert-missing, insert-update, full-idempotent',
		)
		.option('-i, --include <collections...>', 'Space-separated collection names to include')
		.option('-e, --exclude <collections...>', 'Space-separated collection names to exclude')
		.option(
			'--full-reset',
			'Synchronize entire selected collections, ignoring management boundaries (requires full-idempotent)',
		)
		.option('-f, --force', 'Skip confirmation prompts for destructive operations')
		.option(
			'-y, --yes',
			'Skip confirmation prompts for destructive operations (alias for --force)',
		)
		.action(async (input: unknown) => {
			const options = z
				.object({
					mode: z.enum(OperationMode).optional(),
					include: z.array(z.string()).optional(),
					exclude: z.array(z.string()).optional(),
					fullReset: z.boolean().optional(),
					force: z.boolean().optional(),
					yes: z.boolean().optional(),
				})
				.parse(input)
			let exitCode = 0
			let lock: ReturnType<typeof acquireLock> | undefined

			try {
				// Acquire lock to signal other extensions that a bulk operation is in progress
				lock = acquireLock()
				logger.info(`🌱 Seeding Directus with ${scope} data using Directus Seeder...`)

				const config = resolveSeederConfig(env, {
					operationMode: options.mode,
					dataScope: scope,
					includeCollections: options.include,
					excludeCollections: options.exclude,
				})

				const collections = getCollections(config)
				const selected = selectCollections(
					collections.map(({ collection }) => collection),
					config,
				)
				const dataProviders = await getDataProviders(env, selected, scope)
				const presentCollections = collections.filter(({ collection }) =>
					dataProviders?.some((provider) => provider.collectionName === collection),
				)
				const modes = presentCollections.map((collection) => collection.operationMode)
				if (options.fullReset) {
					const invalid = presentCollections.find(
						(collection) => collection.operationMode !== OperationMode.FULL_IDEMPOTENT,
					)
					if (invalid) {
						throw new Error(
							`--full-reset requires full-idempotent mode for collection "${invalid.collection}". Use --mode full-idempotent to override collection modes.`,
						)
					}
				}
				const hasFullIdempotent = modes.includes(OperationMode.FULL_IDEMPOTENT)

				// Validate full-idempotent mode is enabled if requested
				if (hasFullIdempotent && !config.enableFullIdempotent) {
					logger.error(
						'full-idempotent mode is disabled for safety. Set SEEDER_ENABLE_FULL_IDEMPOTENT=true to enable this destructive operation.',
					)
					exitCode = 1
					return // Exit early but still go to finally
				}

				// Check if we need to confirm destructive operations
				const force = (options.force ?? false) || (options.yes ?? false)
				const skipConfirmation = shouldSkipConfirmation(force)

				// Confirm potentially destructive operations
				if (!skipConfirmation) {
					if (!hasFullIdempotent && modes.includes(OperationMode.INSERT_UPDATE)) {
						const confirmed = await confirmYesNo(
							'⚠️  WARNING: insert-update mode will OVERWRITE existing records\n' +
								'This will update existing data to match your seed files.\n' +
								'Any manual changes to seeded records will be lost.\n' +
								'Continue?',
							false,
							logger,
						)

						if (!confirmed) {
							logger.info('Operation cancelled by user')
							exitCode = 0
							return // Exit early but still go to finally
						}
					} else if (hasFullIdempotent) {
						const confirmed = await confirmExplicit(
							'🚨 DANGER: full-idempotent mode will DELETE records not in seed data\n' +
								(options.fullReset
									? '--full-reset ignores management boundaries: the ENTIRE selected collection can be affected, including unmanaged records.\n'
									: '') +
								'This operation is DESTRUCTIVE and CANNOT BE UNDONE.\n' +
								'Records in your database that are not in seed files will be permanently deleted.\n' +
								"Type 'DELETE' to confirm this destructive operation:",
							'DELETE',
							logger,
						)

						if (!confirmed) {
							logger.info('Operation cancelled by user')
							exitCode = 0
							return // Exit early but still go to finally
						}
					}
				}

				const results = await seedSystem(context, config, dataProviders, options.fullReset)
				if (results?.some((result) => result.error !== undefined)) {
					logger.error(
						`❌ ${scope === 'system' ? 'System' : 'Core'} data seeding failed; see collection errors above`,
					)
					exitCode = 1
				}

				// Clear the cache even after failures: earlier mutations may have succeeded.
				if (results !== null) {
					const schema = await getSchema()
					const utilsService = new services.UtilsService({
						schema,
						accountability: {
							role: null,
							roles: [],
							user: null,
							admin: true,
							app: false,
							ip: null,
						},
					})
					await utilsService.clearCache({ system: true })
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error'
				logger.error(`❌ Failed to seed ${scope} data: ${message}`)
				logger.error(error)
				exitCode = 1
			} finally {
				if (lock?.release()) {
					logger.trace('🧹 Released process lock')
				}

				// Exit with the appropriate exit code after cleanup
				process.exit(exitCode)
			}
		})
}
