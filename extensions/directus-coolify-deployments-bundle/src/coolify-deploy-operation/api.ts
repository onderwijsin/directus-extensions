import { ForbiddenError } from '@directus/errors'
import { defineOperationApi } from '@directus/extensions-sdk'
import {
	extensionSetup,
	hasKey,
	hasPolicies,
	validateExtensionOptions,
} from '@onderwijsin/directus-extension-utils/server'

import { EXTENSION_NAME } from '../shared/constants'
import { createCoolifyDeploymentClient } from '../shared/coolify-client'
import { envSchema } from './env.schema'

interface CoolifyDeployOptions {
	application: string
}

export default defineOperationApi<CoolifyDeployOptions>({
	id: 'coolify-deploy',
	/**
	 * Trigger a deployment for a configured and currently deployable application.
	 * @param options - Configured operation options.
	 * @param options.application - Directus ID of the configured application.
	 * @param context - Directus operation context.
	 * @returns Coolify's deployment trigger result.
	 */
	handler: async ({ application }, context) => {
		const { accountability, env, getSchema, logger, services } = context
		const setup = extensionSetup(EXTENSION_NAME, env, logger)
		setup.start()

		if (!setup.isEnabled()) return null

		const options = validateExtensionOptions(env, envSchema, logger)
		if (
			accountability &&
			accountability.admin !== true &&
			(!hasKey(accountability, 'admin_access') || accountability.admin_access !== true) &&
			!(await hasPolicies(
				accountability,
				options.COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID,
				services,
				await getSchema(),
				null,
			))
		) {
			throw new ForbiddenError()
		}
		const configuredApplication = await new services.ItemsService(
			options.COOLIFY_APPLICATIONS_COLLECTION,
			{
				schema: await getSchema(),
				accountability: null,
			},
		).readOne(application)

		if (!configuredApplication.enabled || !configuredApplication.deploy_enabled) {
			throw new ForbiddenError()
		}

		const client = createCoolifyDeploymentClient(options, {
			...options,
			CACHE_ENABLED: false,
			services,
			getSchema,
			logger,
		})
		const result = await client.deploy({ uuid: configuredApplication.application_uuid })
		setup.end()
		return result
	},
})
