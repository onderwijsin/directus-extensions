/**
 * @fileoverview Composes Sluggernaut's API hook services and registrations.
 *
 * Sluggernaut's API hook entrypoint.
 *
 * The entrypoint validates the extension lifecycle first, then wires the shared field cache,
 * startup provisioning, cache invalidation, and item mutation handlers. Individual handlers keep
 * their registration details in separate modules so this file remains the composition boundary.
 */
import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	extensionSetup,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { createFieldReader } from '../server/field-reader'
import { EXTENSION_NAME } from '../shared/configuration/constants'
import { registerFieldCacheInvalidation } from './configuration/cache-invalidation'
import { envSchema } from './configuration/env.schema'
import { registerSluggernautStartup } from './configuration/startup'
import { registerSluggernautItemHooks } from './mutation/item-hooks'

export default defineHook((hook, context) => {
	const setup = extensionSetup(EXTENSION_NAME, context.env, context.logger)
	setup.start()

	if (!setup.isEnabled()) {
		// Disabled extensions still complete their lifecycle bookkeeping before returning.
		setup.end()
		return
	}

	const options = validateExtensionOptions(context.env, envSchema, context.logger)
	// All handlers in this hook share one cache so schema reads stay collection-scoped and cheap.
	const fieldReader = createFieldReader(context, {
		ttl: options.SLUGGERNAUT_FIELDS_CACHE_TTL_MS,
	})

	registerSluggernautStartup(hook.action, context, options)
	registerFieldCacheInvalidation(hook, fieldReader)
	registerSluggernautItemHooks(hook, context, options, fieldReader)

	setup.end()
})
