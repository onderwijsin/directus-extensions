import type { HookConfig } from '@onderwijsin/directus-extension-utils/types'
import type { Command } from 'commander'

import process from 'node:process'

import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { registerConfigCommand } from './commands/configCommand'
import { registerExtractCommand } from './commands/extractCommand'
import { registerSeedCommand } from './commands/seedCommand'
import { envSchema } from './env.schema'
import { DataScope } from './lib/config'
import { registerAutoExtractSystemHook } from './seeders/system/autoExtract'

/**
 * Extraction is available only for the exact legacy development environment value.
 * @param deploymentEnv - Directus deployment environment.
 * @returns Whether extraction commands and hooks may register.
 */
export const isExtractionAvailable = (deploymentEnv: unknown): boolean =>
	deploymentEnv === 'development'

/**
 * Registers the standalone seeder CLI and development-only automatic extraction.
 * @param register - Directus hook registration functions.
 * @param context - Directus hook runtime.
 * @returns Nothing.
 */
export const registerSeeder: HookConfig = (register, context) => {
	const { init, action } = register
	const setup = extensionSetup('seeder', context.env, context.logger)
	setup.start()
	if (!setup.isEnabled()) return
	const options = validateExtensionOptions(context.env, envSchema, context.logger)
	const seederContext = { ...context, env: options }
	const extractionAvailable = isExtractionAvailable(options.DEPLOYMENT_ENV)

	init('cli.after', (meta: Record<string, Command>) => {
		const program = meta.program
		if (!program) throw new TypeError('Directus CLI program is missing')
		const command = program
			.command('seed')
			.description('Directus Seeder commands for system and application data')
		registerSeedCommand(command, seederContext)
		registerSeedCommand(command, seederContext, DataScope.CORE)
		registerConfigCommand(command, seederContext)
		if (extractionAvailable) registerExtractCommand(command, seederContext)
	})

	// Directus loads hooks before parsing CLI arguments. Inspection must not eagerly load
	// consumer JSON through auto-extraction, including when --defaults bypasses that file.
	const configInspection = process.argv[2] === 'seed' && process.argv[3] === 'config'
	if (extractionAvailable && !configInspection)
		registerAutoExtractSystemHook(action, seederContext)
	setup.end()
}

export default defineHook(registerSeeder)
