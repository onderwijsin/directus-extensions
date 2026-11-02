import type { HookConfig } from '@onderwijsin/directus-extension-utils/types'
import type { Command } from 'commander'

import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { registerExtractCommand } from './commands/extractCommand'
import { registerSystemCommand } from './commands/systemCommand'
import { envSchema } from './env.schema'
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
			.description('Directus Seeder commands for system data and extraction')
		registerSystemCommand(command, seederContext)
		if (extractionAvailable) registerExtractCommand(command, seederContext)
	})

	if (extractionAvailable) registerAutoExtractSystemHook(action, seederContext)
	setup.end()
}

export default defineHook(registerSeeder)
