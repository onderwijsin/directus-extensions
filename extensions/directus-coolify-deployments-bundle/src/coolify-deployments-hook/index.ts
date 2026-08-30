import { defineHook } from '@onderwijsin/directus-extension-utils/hook'
import {
	ensureDirectusPolicy,
	ensureDirectusSchema,
	validatePolicyDefinition,
	validateSchemaDefinition,
	createDirectusStartupCoordinator,
	extensionSetup,
	withCollectionIdentity,
	validateExtensionOptions,
	initializePolicyCache,
	registerPolicyCacheInvalidation,
} from '@onderwijsin/directus-extension-utils/server'

import coolifyApplicationsSchema from '../../schema/coolify_applications.json'
import coolifyPolicies from '../../schema/coolify_policies.json'
import {
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
	EXTENSION_ID,
	EXTENSION_NAME,
} from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { registerApplicationEnrichmentHook } from './application-enrichment'
import { envSchema } from './env.schema'
import { resolveCoolifyPolicyId } from './policy-ids'

/**
 * Registers schema management for the configured Coolify applications collection.
 * @param hook - Directus hook registration context.
 * @param context - Directus extension context.
 * @returns Nothing.
 */
export default defineHook((hook, context) => {
	const { filter } = hook
	const { env, logger } = context
	const setup = extensionSetup(EXTENSION_NAME, env, logger)
	setup.start()

	if (!setup.isEnabled()) return

	const options = validateExtensionOptions(env, envSchema, logger)
	const client = createCoolifyDeploymentClient(options, {
		...options,
		services: context.services,
		getSchema: context.getSchema,
		logger,
	})

	const startup = createDirectusStartupCoordinator(hook, logger, {
		id: EXTENSION_ID,
		name: 'Coolify deployments',
		disabled: !options.COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED,
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
				options.COOLIFY_APPLICATIONS_COLLECTION,
				validateSchemaDefinition(coolifyApplicationsSchema),
			),
			services: context.services,
			options: {
				abortOnError: options.COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR,
				lockProvider,
			},
		})
	})
	startup.data(async ({ lockProvider }) => {
		const policyDefinitions = validatePolicyDefinition(coolifyPolicies)
		const policyIds = [
			{
				default: DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
				resolved: options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID,
			},
			{
				default: DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
				resolved: options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID,
			},
			{
				default: DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
				resolved: options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID,
			},
		]

		for (const policy of policyDefinitions.policies) {
			const permissions = policy.permissions.map((permission) => ({
				...permission,
				collection: options.COOLIFY_APPLICATIONS_COLLECTION,
			}))
			await ensureDirectusPolicy({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger,
				services: context.services,
				definition: {
					...policy,
					permissions,
					id: resolveCoolifyPolicyId(policy.id, policyIds),
				},
				options: {
					abortOnError: options.COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR,
					lockProvider,
				},
			})
		}
	})

	registerApplicationEnrichmentHook(
		filter,
		options.COOLIFY_APPLICATIONS_COLLECTION,
		client,
		logger,
	)
	if (options.DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED) {
		const policyCache = initializePolicyCache(options)
		registerPolicyCacheInvalidation(hook, context, policyCache)
	}

	setup.end()
})
