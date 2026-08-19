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
})
