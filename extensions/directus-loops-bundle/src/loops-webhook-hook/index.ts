import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { createLoopsClient } from '../shared/client'
import { EXTENSION_NAME } from '../shared/constants'
import { envSchema } from '../shared/env.schema'
import { registerLoopsProfileSyncHook } from './profile-sync'
import { registerLoopsStartup } from './startup'
import { createLoopsWebhookMiddleware } from './verification'

/**
 * Registers the Loops collections and optional campaign policies at Directus startup.
 *
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns Nothing.
 */
export default defineHook((hook, context) => {
	const { action, init } = hook
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) {
		setup.end()
		return
	}

	const options = validateExtensionOptions(env, envSchema, logger)

	registerLoopsStartup(hook, context, options)

	if (options.LOOPS_SYNC_ENABLED && options.LOOPS_API_KEY) {
		const loops = createLoopsClient(options)
		registerLoopsProfileSyncHook(action, loops, context, options)
	}

	if (options.LOOPS_WEBHOOK_SIGNING_SECRET) {
		// IMPORTANT: must use after, so express.json() is already called by Directus and we can access raw body
		init('middlewares.after', ({ app }) => {
			// oxlint-disable-next-line typescript/no-unsafe-call -- Directus exposes the Express app through the init hook context. It just doesn't type it.
			app.use(
				'/flows/trigger/:id',
				createLoopsWebhookMiddleware(
					options.LOOPS_WEBHOOK_SIGNING_SECRET,
					options.LOOPS_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
				),
			)
		})
	}

	setup.end()
})
