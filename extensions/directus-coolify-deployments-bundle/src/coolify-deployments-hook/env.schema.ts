import {
	cacheConfigSchema,
	directusStartupSchema,
} from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import {
	DEFAULT_READ_DEPLOYMENTS_POLICY_ID,
	DEFAULT_MANAGE_APPLICATIONS_POLICY_ID,
	DEFAULT_TRIGGER_DEPLOYMENTS_POLICY_ID,
} from '../shared/constants'
import { coolifyEnvironmentSchema } from '../shared/coolify-client/schemas'

/**
 * Validates environment values used by the Directus startup hook.
 * @returns The hook environment schema.
 */
const hookEnvSchema = directusStartupSchema.extend({
	COOLIFY_DEPLOYMENTS_ENABLED: coolifyEnvironmentSchema.shape.COOLIFY_DEPLOYMENTS_ENABLED,
	COOLIFY_APPLICATIONS_COLLECTION: coolifyEnvironmentSchema.shape.COOLIFY_APPLICATIONS_COLLECTION,
	COOLIFY_URL: coolifyEnvironmentSchema.shape.COOLIFY_URL,
	COOLIFY_TOKEN: coolifyEnvironmentSchema.shape.COOLIFY_TOKEN,
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
})

export const envSchema = z.intersection(
	hookEnvSchema,
	cacheConfigSchema.safeExtend({
		CACHE_ENABLED: z.boolean().default(true),
		DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED: z.boolean().default(true),
	}),
)
