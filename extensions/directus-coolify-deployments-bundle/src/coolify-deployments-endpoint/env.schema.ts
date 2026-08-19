import {
	cacheConfigSchema,
	directusStartupSchema,
} from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import {
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../shared/constants'
import { coolifyEnvironmentSchema } from '../shared/coolify-client/schemas'

/**
 * Validates environment values used by the Coolify deployments endpoint.
 * @returns The endpoint environment schema.
 */
const endpointEnvSchema = directusStartupSchema.extend(coolifyEnvironmentSchema.shape).safeExtend({
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
})

export const envSchema = z.intersection(
	endpointEnvSchema,
	cacheConfigSchema.safeExtend({ CACHE_ENABLED: z.boolean().default(true) }),
)
