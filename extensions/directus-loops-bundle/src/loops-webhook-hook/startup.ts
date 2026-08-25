/**
 * Coordinates Loops schema and policy provisioning at Directus startup.
 *
 * The user profile schema is optional and follows LOOPS_SYNC_ENABLED. Campaign and recipient
 * schemas remain available independently for webhook campaign archiving.
 */
import type { HookExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { LoopsEnv } from '../shared/env.schema'

import {
	createDirectusStartupCoordinator,
	ensureDirectusPolicy,
	ensureDirectusSchema,
	validatePolicyDefinition,
	validateSchemaDefinition,
	withCollectionIdentity,
} from '@onderwijsin/directus-extension-utils/server'

import campaignRecipientsSchema from '../../schema/loops_campaign_recipients.json'
import campaignsSchema from '../../schema/loops_campaigns.json'
import directusUsersSchema from '../../schema/loops_directus_users.json'
import campaignPolicies from '../../schema/loops_policies.json'
import {
	DEFAULT_MANAGE_EMAIL_CAMPAIGNS_POLICY_ID,
	DEFAULT_VIEW_EMAIL_CAMPAIGNS_POLICY_ID,
	EXTENSION_ID,
} from '../shared/constants'

/**
 * Rewrites the recipient relation after campaign collection customization.
 * @param campaignsCollection - Configured campaign collection name.
 * @param definition - Validated recipient schema definition.
 * @returns Recipient schema with the configured campaign relation.
 */
const withCampaignRelationIdentity = (
	campaignsCollection: string,
	definition: ReturnType<typeof validateSchemaDefinition>,
) => ({
	...definition,
	relations: definition.relations.map((relation) =>
		relation.related_collection === 'loops_campaigns'
			? {
					...relation,
					related_collection: campaignsCollection,
					meta: relation.meta
						? { ...relation.meta, one_collection: campaignsCollection }
						: relation.meta,
				}
			: relation,
	),
})

/**
 * Rewrites the opt-in field after a consumer customizes its Directus user field name.
 * @param fieldName - Configured Directus user field name.
 * @param definition - Validated user-field schema definition.
 * @returns User-field schema with the configured field name.
 */
const withSyncFieldIdentity = (
	fieldName: string,
	definition: ReturnType<typeof validateSchemaDefinition>,
) => ({
	...definition,
	fields: definition.fields.map((field) =>
		field.field === 'loops_sync_enabled' ? { ...field, field: fieldName } : field,
	),
})

/**
 * Registers Loops schema and policy startup coordination.
 * @param action - Directus action registration function.
 * @param context - Directus hook extension context.
 * @param options - Validated Loops environment options.
 * @returns Nothing.
 */
export function registerLoopsStartup(
	action: RegisterFunctions['action'],
	context: HookExtensionContext,
	options: LoopsEnv,
): void {
	const startup = createDirectusStartupCoordinator(action, context.logger, {
		id: EXTENSION_ID,
		name: 'Loops',
		disabled: !options.LOOPS_SCHEMA_CHANGES_ENABLED,
		disabledGlobally: !options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED,
		dataDisabledGlobally: !options.DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED,
		lockProviderConfig: { ...options, DIRECTUS_EXTENSION_ID: EXTENSION_ID },
	})

	startup.schema(async ({ lockProvider }) => {
		if (options.LOOPS_SYNC_ENABLED) {
			await ensureDirectusSchema({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition: withSyncFieldIdentity(
					options.LOOPS_SYNC_ENABLED_FIELD,
					validateSchemaDefinition(directusUsersSchema),
				),
				options: { lockProvider, abortOnError: options.LOOPS_SCHEMA_ABORT_ON_ERROR },
			})
		}

		await ensureDirectusSchema({
			id: EXTENSION_ID,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: withCollectionIdentity(
				options.LOOPS_CAMPAIGNS_COLLECTION,
				validateSchemaDefinition(campaignsSchema),
			),
			options: { lockProvider, abortOnError: options.LOOPS_SCHEMA_ABORT_ON_ERROR },
		})
		await ensureDirectusSchema({
			id: EXTENSION_ID,
			database: context.database,
			getSchema: context.getSchema,
			logger: context.logger,
			services: context.services,
			definition: withCampaignRelationIdentity(
				options.LOOPS_CAMPAIGNS_COLLECTION,
				withCollectionIdentity(
					options.LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION,
					validateSchemaDefinition(campaignRecipientsSchema),
				),
			),
			options: { lockProvider, abortOnError: options.LOOPS_SCHEMA_ABORT_ON_ERROR },
		})
	})

	startup.data(async ({ lockProvider }) => {
		const enabledPolicyIds = new Set(
			[
				options.LOOPS_MANAGE_EMAIL_CAMPAIGNS_POLICY_ENABLED
					? DEFAULT_MANAGE_EMAIL_CAMPAIGNS_POLICY_ID
					: null,
				options.LOOPS_VIEW_EMAIL_CAMPAIGNS_POLICY_ENABLED
					? DEFAULT_VIEW_EMAIL_CAMPAIGNS_POLICY_ID
					: null,
			].filter((id): id is string => id !== null),
		)
		const definitions = validatePolicyDefinition(campaignPolicies)

		for (const definition of definitions.policies) {
			if (!enabledPolicyIds.has(definition.id)) continue

			await ensureDirectusPolicy({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger: context.logger,
				services: context.services,
				definition: {
					...definition,
					permissions: definition.permissions.map((permission) => ({
						...permission,
						collection:
							permission.collection === 'loops_campaigns'
								? options.LOOPS_CAMPAIGNS_COLLECTION
								: options.LOOPS_CAMPAIGN_RECIPIENTS_COLLECTION,
					})),
				},
				options: { lockProvider, abortOnError: options.LOOPS_SCHEMA_ABORT_ON_ERROR },
			})
		}
	})
}
