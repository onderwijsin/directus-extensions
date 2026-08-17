import { createError } from '@directus/errors'
import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

const EXTENSION_NAME = 'magic_links'
const NotImplementedError = createError(
	'MAGIC_LINKS_NOT_IMPLEMENTED',
	'Magic-link authentication is not implemented yet.',
	501,
)

/**
 * Registers the magic-link API endpoint bundle entry.
 *
 * @param router - Directus's endpoint router.
 * @param context - Directus endpoint context.
 * @returns void
 */
export default defineEndpoint((router, context) => {
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	validateExtensionOptions(env, envSchema, logger)

	router.post('/request', () => {
		throw new NotImplementedError()
	})

	router.post('/redeem', () => {
		throw new NotImplementedError()
	})

	setup.end()
})
