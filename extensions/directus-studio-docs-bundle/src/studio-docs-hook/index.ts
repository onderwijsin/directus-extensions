import { defineHook } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '../shared/constants'
import { envSchema } from './env.schema'

/**
 * Registers the Studio Docs server lifecycle boundary.
 *
 * @param _hook - Directus hook registration context reserved for later phases.
 * @param context - Directus extension context containing environment and logger.
 * @returns Nothing when disabled or after validating the configuration.
 */
export default defineHook((_hook, context) => {
	const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
	setup.start()

	if (!setup.isEnabled()) return

	validateExtensionOptions(context.env, envSchema, context.logger)
	setup.end()
})
