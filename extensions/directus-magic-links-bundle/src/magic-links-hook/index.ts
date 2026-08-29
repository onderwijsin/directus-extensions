import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	ensureDirectusSchema,
	validateSchemaDefinition,
	createDirectusStartupCoordinator,
	extensionSetup,
	withCollectionIdentity,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import magicLinksSchema from '../../schema/magic_links.json'
import { registerMagicLinkJwt } from './auth-jwt'
import { registerMagicLinkCleanup } from './cleanup'
import { EXTENSION_ID, EXTENSION_NAME } from './constants'
import { envSchema } from './env.schema'

/**
 * Registers lifecycle and scheduled-maintenance hooks for magic links.
 *
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns void
 */
export default defineHook((hook, context) => {
	const { action, filter, schedule } = hook
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)

	const startup = createDirectusStartupCoordinator(action, logger, {
		id: EXTENSION_ID,
		name: 'Magic links',
		disabled: !options.MAGIC_LINKS_SCHEMA_CHANGES_ENABLED,
		disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
	})
	startup.schema(async ({ lockProvider }) => {
		await ensureDirectusSchema({
			id: EXTENSION_ID,
			database: context.database,
			getSchema: context.getSchema,
			logger,
			definition: withCollectionIdentity(
				options.MAGIC_LINKS_COLLECTION,
				validateSchemaDefinition(magicLinksSchema),
			),
			services: context.services,
			options: {
				abortOnError: options.MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR,
				lockProvider,
			},
		})
	})

	registerMagicLinkCleanup(schedule, {
		database: context.database,
		collection: options.MAGIC_LINKS_COLLECTION,
		retentionWindow: options.MAGIC_LINK_CLEANUP_WINDOW,
		cron: options.MAGIC_LINK_CLEANUP_CRON,
		enabled: options.USE_MAGIC_LINK_CLEANUP,
		logger,
	})

	registerMagicLinkJwt(filter, context.database)

	setup.end()
})
