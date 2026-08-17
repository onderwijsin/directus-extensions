import { defineEndpoint } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

const EXTENSION_NAME = 'sentry-test-endpoint'

export default defineEndpoint((router, { env, logger }) => {
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)

	if (!options.SENTRY_ENABLED || !options.SENTRY_TEST_SUITE_ENABLED) {
		logger.info(
			`⛔️ Extension ${EXTENSION_NAME} is disabled via "SENTRY_ENABLED" or "SENTRY_TEST_SUITE_ENABLED". Skipping setup...`,
		)
		return
	}

	setup.start()

	router.get('/', () => {
		throw new Error('Intentional back end error for Sentry test')
	})

	setup.end()
})
