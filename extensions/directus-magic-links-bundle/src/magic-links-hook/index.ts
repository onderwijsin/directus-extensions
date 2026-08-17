import type { DirectusSchemaDefinition } from '@onderwijsin/directus-extension-utils/server'

import { defineHook } from '@directus/extensions-sdk'
import {
	ensureDirectusSchema,
	extensionSetup,
	registerSchemaChangeOnStart,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import magicLinksSchema from '../../schema/directus_magic_links.json'
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

	const options = validateExtensionOptions(env, envSchema, logger)

	registerSchemaChangeOnStart(
		action,
		logger,
		() =>
			ensureDirectusSchema({
				extensionId: 'magic-links',
				database: context.database,
				getSchema: context.getSchema,
				logger,
				definition: magicLinksSchema as unknown as DirectusSchemaDefinition,
				services: context.services,
				options: {
					useLockedSchemaChange:
						options.MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE ??
						options.DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE,
					abortOnError: options.MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR,
					lockProviderConfig: options,
				},
			}),
		{
			name: 'Magic links',
			disabled: !options.MAGIC_LINKS_SCHEMA_CHANGES_ENABLED,
			disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		},
	)

	setup.end()
})
