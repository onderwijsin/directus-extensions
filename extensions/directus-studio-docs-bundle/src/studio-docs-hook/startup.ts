import type { HookExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { StudioDocsEnv } from './env.schema'

import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	createDirectusStartupCoordinator,
	ensureDirectusPolicy,
	ensureDirectusSchema,
	validatePolicyDefinition,
	validateSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import policies from '../../schema/policies.json'
import schema from '../../schema/studio_docs.json'
import { COLLECTION_NAME, EXTENSION_ID } from '../shared/constants'

/**
 * Registers the fixed Studio Docs schema and optional policy startup work.
 * @param hook - Directus hook registration functions.
 * @param context - Directus hook context.
 * @param options - Validated Studio Docs configuration.
 * @returns Nothing.
 */
export function registerStudioDocsStartup(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: StudioDocsEnv,
): void {
	const startup = createDirectusStartupCoordinator(hook, context.logger, {
		id: EXTENSION_ID,
		name: 'Studio Docs',
		disabled: false,
		disabledGlobally: false,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
	})

	startup.schema(async ({ lockProvider }) => {
		if (
			!options.DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED ||
			!options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED
		)
			return

		await ensureDirectusSchema({
			id: EXTENSION_ID,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: validateSchemaDefinition(schema),
			options: {
				lockProvider,
				abortOnError: options.DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR,
			},
		})
	})

	startup.data(async ({ lockProvider }) => {
		if (!options.DIRECTUS_DOCS_SEED_ENABLED) return
		if (
			!options.DIRECTUS_DOCS_MANAGE_POLICY_ENABLED &&
			!options.DIRECTUS_DOCS_VIEW_POLICY_ENABLED
		)
			return

		const schemaOverview = await context.getSchema()
		const collectionsService = new context.services.CollectionsService({
			schema: schemaOverview,
			accountability: null,
			knex: context.database,
		})
		const collection = await attempt(() => collectionsService.readOne(COLLECTION_NAME))
		if (collection.error) {
			context.logger.info({
				msg: 'Studio Docs policy seeding skipped; collection is unavailable',
				collection: COLLECTION_NAME,
			})
			return
		}

		const enabledPolicyIds = new Set(
			[
				options.DIRECTUS_DOCS_MANAGE_POLICY_ENABLED ? policies.policies[0]?.id : undefined,
				options.DIRECTUS_DOCS_VIEW_POLICY_ENABLED ? policies.policies[1]?.id : undefined,
			].filter((id): id is string => typeof id === 'string'),
		)
		for (const definition of validatePolicyDefinition(policies).policies) {
			if (!enabledPolicyIds.has(definition.id)) continue
			await ensureDirectusPolicy({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition,
				options: {
					lockProvider,
					abortOnError: options.DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR,
				},
			})
		}
	})
}
