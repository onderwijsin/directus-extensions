import { defineHook } from '@directus/extensions-sdk'
import {
	ensureDirectusSchema,
	extensionSetup,
	registerSchemaChangeOnStart,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { envSchema } from './env.schema'
import { createCoolifyApplicationsSchema } from './schema'

/**
 * Registers schema management for the configured Coolify applications collection.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns Nothing.
 */
export default defineHook((hook, context) => {
	const { action } = hook
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)

	registerSchemaChangeOnStart(
		action,
		logger,
		() =>
			ensureDirectusSchema({
				extensionId: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger,
				definition: createCoolifyApplicationsSchema(
					options.COOLIFY_APPLICATIONS_COLLECTION,
				),
				services: context.services,
				options: {
					abortOnError: options.COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR,
					lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
				},
			}),
		{
			name: 'Coolify deployments',
			disabled: !options.COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED,
			disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		},
	)

	setup.end()
})
