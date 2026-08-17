import { defineHook } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

const EXTENSION_NAME = 'magic_links'

/**
 * Registers lifecycle and scheduled-maintenance hooks for magic links.
 *
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns void
 */
export default defineHook((hook, context) => {
	const { action } = hook
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	validateExtensionOptions(env, envSchema, logger)

	action('server.start', () => {
		logger.info(
			'Magic-links startup hook scaffold loaded; schema setup is not implemented yet.',
		)
	})

	setup.end()
})
