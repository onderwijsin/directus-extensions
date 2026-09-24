import {
	cacheConfig,
	defineExtensionOptionsSchema,
	directusStartupConfig,
} from '@onderwijsin/directus-extension-utils/server'

import {
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../shared/constants'
import { defineCoolifyEnvironmentOptions } from '../shared/coolify-client/schemas'

/**
 * Validates environment values used by the Directus startup hook.
 * @returns The hook environment definition.
 */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig, cacheConfig],
	/**
	 * Builds hook fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Hook environment fields.
	 */
	options: (z) => ({
		...defineCoolifyEnvironmentOptions(z),
		COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
		COOLIFY_DEPLOYMENTS_DOCS_SEED_ENABLED: z.boolean().default(true),
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: z
			.uuid()
			.default(DEFAULT_MANAGE_APPLICATIONS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: z
			.uuid()
			.default(DEFAULT_READ_DEPLOYMENTS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
			.uuid()
			.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
		DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED: z.boolean().default(true),
	}),
})
