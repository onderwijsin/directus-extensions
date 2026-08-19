import { directusStartupSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { coolifyEnvironmentSchema } from '../shared/schemas'

/**
 * Validates environment values used by the Directus startup hook.
 * @returns The hook environment schema.
 */
export const envSchema = directusStartupSchema.extend({
	COOLIFY_DEPLOYMENTS_ENABLED: coolifyEnvironmentSchema.shape.COOLIFY_DEPLOYMENTS_ENABLED,
	COOLIFY_APPLICATIONS_COLLECTION: coolifyEnvironmentSchema.shape.COOLIFY_APPLICATIONS_COLLECTION,
	COOLIFY_DEPLOYMENTS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	COOLIFY_DEPLOYMENTS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	COOLIFY_DEPLOYMENTS_MANAGE_APPLICATIONS_POLICY_ID: z
		.uuid()
		.default('0c9f0b1e-0a0b-4b7c-8a27-4b7a6e1f2d31'),
	COOLIFY_DEPLOYMENTS_READ_DEPLOYMENTS_POLICY_ID: z
		.uuid()
		.default('2e7a4c63-1d5f-46bb-9b02-8f3c7a5d6e14'),
	COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: z
		.uuid()
		.default('7b3d9e20-5f61-4a8c-b274-1e6d9f0a3c58'),
})
