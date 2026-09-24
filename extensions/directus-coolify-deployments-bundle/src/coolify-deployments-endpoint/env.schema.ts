import {
	cacheConfig,
	defineExtensionOptionsSchema,
	directusStartupConfig,
} from '@onderwijsin/directus-extension-utils/server'

import {
	DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS,
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../shared/constants'
import { defineCoolifyEnvironmentOptions } from '../shared/coolify-client/schemas'

/**
 * Validates environment values used by the Coolify deployments endpoint.
 * @returns The endpoint environment definition.
 */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig, cacheConfig],
	/**
	 * Builds endpoint fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Endpoint environment fields.
	 */
	options: (z) => ({
		...defineCoolifyEnvironmentOptions(z),
		PUBLIC_URL: z.url().optional(),
		COOLIFY_DEPLOYMENTS_SAME_ORIGIN_ENABLED: z.boolean().default(true),
		COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_MANAGE_APPLICATIONS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_READ_DEPLOYMENTS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
			.string()
			.trim()
			.min(1)
			.default(DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID),
		COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: z.coerce
			.number()
			.int()
			.min(250)
			.default(DEFAULT_DEPLOYMENT_POLL_INTERVAL_MS),
	}),
})
