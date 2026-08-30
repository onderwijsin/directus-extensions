/**
 * Coordinates Sluggernaut's optional schema and policy provisioning at Directus startup.
 *
 * Schema changes and data seeding are delegated to the shared startup coordinator, which handles
 * global/extension switches and distributed locking. This file supplies the extension-specific
 * schema and policy definitions and skips policy work when the redirect collection is unavailable.
 */
import type { HookExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { SluggernautEnv } from './env.schema'

import { attempt } from '@onderwijsin/directus-extension-utils'
import {
	ensureDirectusPolicy,
	ensureDirectusSchema,
	ensureDirectusDocumentation,
	validatePolicyDefinition,
	validateSchemaDefinition,
	createDirectusStartupCoordinator,
	withCollectionIdentity,
} from '@onderwijsin/directus-extension-utils/server'

import docsArticle from '../../../docs/sluggernaut.json'
import redirectPolicies from '../../../schema/policies.json'
import redirectSchema from '../../../schema/redirects.json'
import { EXTENSION_NAME, POLICY_IDS } from '../../shared/configuration/constants'

/**
 * Registers Sluggernaut schema and policy startup coordination.
 * @param hook - Directus hook registration functions.
 * @param context - Directus hook extension context.
 * @param options - Validated extension options.
 * @returns Nothing.
 */
export function registerSluggernautStartup(
	hook: RegisterFunctions,
	context: HookExtensionContext,
	options: SluggernautEnv,
): void {
	const startup = createDirectusStartupCoordinator(hook, context.logger, {
		id: EXTENSION_NAME,
		name: 'Sluggernaut',
		disabled: !options.SLUGGERNAUT_SCHEMA_CHANGES_ENABLED,
		disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		abortOnError: options.SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_NAME },
	})

	startup.schema(async ({ lockProvider }) => {
		// The redirect collection is installed through the shared, lock-aware schema coordinator.
		await ensureDirectusSchema({
			id: EXTENSION_NAME,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: withCollectionIdentity(
				options.SLUGGERNAUT_REDIRECTS_COLLECTION,
				validateSchemaDefinition(redirectSchema),
			),
			options: { lockProvider, abortOnError: options.SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR },
		})
	})

	startup.documentation(async ({ lockProvider }) => {
		await ensureDirectusDocumentation(docsArticle, context, {
			lockProvider,
			extensionName: 'Sluggernaut',
			extensionSeedEnabled: options.SLUGGERNAUT_DOCS_SEED_ENABLED,
		})
	})

	startup.data(async ({ lockProvider }) => {
		// Policies are optional and must not be created before their target collection exists.
		if (
			!options.SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED &&
			!options.SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED
		)
			return

		const schema = await context.getSchema()
		const collectionsService = new context.services.CollectionsService({
			schema,
			accountability: null,
			knex: context.database,
		})

		// Because DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED can be disabled, we need to manually check if the collection exists.
		const { error } = await attempt(() =>
			collectionsService.readOne(options.SLUGGERNAUT_REDIRECTS_COLLECTION),
		)

		if (error) {
			context.logger.warn(
				'Sluggernaut policy registration skipped; redirect collection is unavailable.',
				{
					collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
					code: 'redirect-collection-unavailable',
				},
			)
			return
		}

		const definitions = validatePolicyDefinition(redirectPolicies)

		// Only seed the policy that are enabled via config
		const enabledPolicies = new Set<string>(
			[
				options.SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED
					? POLICY_IDS.manageRedirects
					: null,
				options.SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED
					? POLICY_IDS.readActiveRedirects
					: null,
			].filter((id) => id !== null),
		)
		for (const definition of definitions.policies) {
			if (!enabledPolicies.has(definition.id)) continue
			await ensureDirectusPolicy({
				id: EXTENSION_NAME,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition: {
					...definition,
					permissions: definition.permissions.map((permission) => ({
						...permission,
						collection: options.SLUGGERNAUT_REDIRECTS_COLLECTION,
					})),
				},
				options: { lockProvider, abortOnError: options.SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR },
			})
		}
	})
}
