import type * as SentryTypes from '@sentry/node'

import { createRequire } from 'node:module'

import { defineHook } from '@directus/extensions-sdk'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

export default defineHook(({ init, embed }, { env, logger }) => {
	const setup = extensionSetup('sentry', env, logger)
	setup.start()

	console.log(typeof env.SENTRY_ENABLED)

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	if (!options.SENTRY_ENABLED) {
		logger.info('⛔️ Extension sentry is disabled via "SENTRY_ENABLED". Skipping setup...')
		return
	}

	// Do not register Sentry Express Error handler without DSN
	if (!options.SENTRY_DSN) {
		logger.warn('⚠️ SENTRY_DSN is not set, skipping Sentry initialization for express')
	} else {
		const require = createRequire(import.meta.url)
		const Sentry = require('@sentry/node') as typeof SentryTypes

		init('routes.custom.after', ({ app }) => {
			Sentry.setupExpressErrorHandler(
				app as Parameters<typeof Sentry.setupExpressErrorHandler>[0],
			)
			logger.info('🐛 Sentry Express Error Handler Added')
		})
	}

	if (!options.SENTRY_LOADER_SCRIPT) {
		logger.warn(
			'⚠️ SENTRY_LOADER_SCRIPT is not set, skipping Sentry initialization for browser',
		)
	} else {
		const release =
			options.SENTRY_RELEASE ?? `${options.SENTRY_RELEASE_PREFIX}@${options.SOURCE_COMMIT}`

		embed(
			`head`,
			`
			<script>
			  window.sentryOnLoad = function () {
				Sentry.init({
					release: "${release}",
					environment: "${options.DEPLOYMENT_ENV}",
					denyUrls: [/^(chrome|moz|safari)-extension:/i, /^extension:/i],
					replaysSessionSampleRate: 0.02,
					replaysOnErrorSampleRate: 1.0,
				});
			  };
			</script>
			${options.SENTRY_LOADER_SCRIPT}
		`,
		)
		logger.info('🐛 Sentry Embed for the Sentry Loader Script Added')
	}

	setup.end()
})
