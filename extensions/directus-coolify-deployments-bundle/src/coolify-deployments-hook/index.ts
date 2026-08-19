import { defineHook } from '@directus/extensions-sdk'
import {
	ensureDirectusPolicy,
	ensureDirectusSchema,
	validatePolicyDefinition,
	validateSchemaDefinition,
	createDirectusStartupCoordinator,
	extensionSetup,
	withCollectionIdentity,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import coolifyApplicationsSchema from '../../schema/coolify_applications.json'
import coolifyPolicies from '../../schema/coolify_policies.json'
import { EXTENSION_ID, EXTENSION_NAME } from '../shared/constants'
import { envSchema } from './env.schema'

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

	const startup = createDirectusStartupCoordinator(action, logger, {
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
			options.COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID,
			options.COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID,
			options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID,
		]

		for (const [index, policy] of policyDefinitions.policies.entries()) {
			await ensureDirectusPolicy({
				id: EXTENSION_ID,
				database: context.database,
				getSchema: context.getSchema,
				logger,
				services: context.services,
				definition: { ...policy, id: policyIds[index] ?? policy.id },
				options: {
					abortOnError: options.COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR,
					lockProvider,
				},
			})
		}
	})

	setup.end()
})
