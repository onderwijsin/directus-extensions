import { defineHook } from '@directus/extensions-sdk'
import { isRecord } from '@onderwijsin/directus-extension-utils'
import {
	ensureDirectusSchema,
	extensionSetup,
	registerSchemaChangeOnStart,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { getMagicLinkRefreshContext } from '../shared/magic-link-refresh-context'
import { registerMagicLinkCleanup } from './cleanup'
import { envSchema } from './env.schema'
import { createMagicLinksSchema } from './schema'

export const EXTENSION_NAME = 'magic_links'
export const EXTENSION_ID = 'magic-links'

type JwtPayload = Record<string, unknown> & {
	enforce_tfa?: boolean
}

/**
 * Narrows a filter payload to a mutable JWT claim object.
 * @param value - Unknown payload received from Directus.
 * @returns Whether the value is an object suitable for JWT claim updates.
 */
const isJwtPayload = (value: unknown): value is JwtPayload => isRecord(value)

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

	filter('auth.jwt', async (payload, meta, { database }) => {
		const refreshContext = getMagicLinkRefreshContext()

		if (
			!isJwtPayload(payload) ||
			!meta.user ||
			!refreshContext ||
			refreshContext.userId !== meta.user ||
			payload.enforce_tfa === true ||
			meta.type !== 'refresh'
		)
			return payload

		const user = await database('directus_users')
			.select('role', 'tfa_secret')
			.where({ id: meta.user })
			.first<{ role: string | null; tfa_secret: string | null }>()

		if (!user || user.tfa_secret || user.role === null) return payload

		const enforcement = await database('directus_access')
			.innerJoin('directus_policies', 'directus_access.policy', 'directus_policies.id')
			.select('directus_policies.id')
			.where('directus_access.role', user.role)
			.where('directus_policies.enforce_tfa', true)
			.first()

		if (enforcement) payload.enforce_tfa = true
		return payload
	})

	registerSchemaChangeOnStart(
		action,
		logger,
		() =>
			ensureDirectusSchema({
				extensionId: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger,
				definition: createMagicLinksSchema(options.MAGIC_LINKS_COLLECTION),
				services: context.services,
				options: {
					abortOnError: options.MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR,
					lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
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
