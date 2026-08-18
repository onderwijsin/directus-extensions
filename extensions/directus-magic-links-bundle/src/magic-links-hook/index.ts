import type { DirectusSchemaDefinition } from '@onderwijsin/directus-extension-utils/server'

import { defineHook } from '@directus/extensions-sdk'
import {
	ensureDirectusSchema,
	extensionSetup,
	registerSchemaChangeOnStart,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import magicLinksSchema from '../../schema/directus_magic_links.json'
import { registerMagicLinkCleanup } from './cleanup'
import { envSchema } from './env.schema'

export const EXTENSION_NAME = 'magic_links'
export const EXTENSION_ID = 'magic-links'

/**
 * Registers lifecycle and scheduled-maintenance hooks for magic links.
 *
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns void
 */
export default defineHook((hook, context) => {
	const { action, schedule } = hook
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
				definition: magicLinksSchema as unknown as DirectusSchemaDefinition,
				services: context.services,
				options: {
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

	registerMagicLinkCleanup(schedule, {
		database: context.database,
		collection: options.MAGIC_LINKS_COLLECTION,
		retentionWindow: options.MAGIC_LINK_CLEANUP_WINDOW,
		cron: options.MAGIC_LINK_CLEANUP_CRON,
		enabled: options.USE_MAGIC_LINK_CLEANUP,
		logger,
	})

	setup.end()
})
