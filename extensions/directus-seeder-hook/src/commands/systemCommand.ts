import type { Command } from 'commander'
import type { ServiceAdapterContext } from '../services/ServiceAdapter'

import process from 'node:process'

import { z } from 'zod'

import { DataScope, OperationMode } from '../lib/config'
import { confirmExplicit, confirmYesNo, shouldSkipConfirmation } from '../lib/confirmationPrompts'
import { acquireLock, releaseLock } from '../lib/processLock'
import { resolveSeederConfig } from '../lib/resolveConfig'
import { seedSystem } from '../seeders/system'

/**
 * Registers the system command for seeding Directus with essential system data.
 *
 * @param parentCommand - The parent command to register this command under
 * @param context - The Directus hook extension context
 * @returns Nothing.
 */
export const registerSystemCommand = (
	parentCommand: Command,
	context: ServiceAdapterContext,
): void => {
	const { logger, env, services, getSchema } = context

	parentCommand
		.command('system')
		.description('Seed Directus with essential system data (roles, permissions, settings)')
		.option(
			'-m, --mode <mode>',
			'Operation mode: insert-missing, insert-update, full-idempotent',
		)
		.option('-i, --include <collections...>', 'Space-separated collection names to include')
		.option('-e, --exclude <collections...>', 'Space-separated collection names to exclude')
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
					force: z.boolean().optional(),
					yes: z.boolean().optional(),
				})
				.parse(input)
			let exitCode = 0

			try {
				// Acquire lock to signal other extensions that a bulk operation is in progress
				acquireLock()
				logger.info('🌱 Seeding Directus with system data using Directus Seeder...')

				const config = resolveSeederConfig(env, {
					operationMode: options.mode,
					dataScope: DataScope.SYSTEM,
					includeCollections: options.include,
					excludeCollections: options.exclude,
				})

				// Validate full-idempotent mode is enabled if requested
				if (
					config.operationMode === OperationMode.FULL_IDEMPOTENT &&
					!config.enableFullIdempotent
				) {
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
					if (config.operationMode === OperationMode.INSERT_UPDATE) {
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
					} else if (config.operationMode === OperationMode.FULL_IDEMPOTENT) {
						const confirmed = await confirmExplicit(
							'🚨 DANGER: full-idempotent mode will DELETE records not in seed data\n' +
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

				const results = await seedSystem(context, config)

				// Preserve cache handling unless no supported seed files exist.
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

				// Success - set exit code to 0
				exitCode = 0
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error'
				logger.error(`❌ Failed to seed system data: ${message}`)
				logger.error(error)
				exitCode = 1
			} finally {
				// Always release the lock
				const released = releaseLock()
				if (released) {
					logger.trace('🧹 Released process lock')
				}

				// Exit with the appropriate exit code after cleanup
				process.exit(exitCode)
			}
		})
}
