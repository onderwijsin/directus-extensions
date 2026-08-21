import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	initializePolicyCache,
	registerPolicyCacheInvalidation,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { envSchema } from './env.schema'

const EXTENSION_NAME = 'policies_endpoint'

/**
 * Registers policy-cache invalidation for the policies endpoint bundle.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns Nothing.
 */
export default defineHook((hook, context) => {
	const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
	setup.start()

	if (!setup.isEnabled()) {
		setup.end()
		return
	}

	const options = validateExtensionOptions(context.env, envSchema, context.logger)
	const cache = initializePolicyCache(options)

	if (options.DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED) {
		registerPolicyCacheInvalidation(hook, context, cache)
	}

	setup.end()
})
