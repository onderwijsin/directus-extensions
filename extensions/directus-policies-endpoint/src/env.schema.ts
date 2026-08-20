import { cacheConfigSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

/**
 * Validates the environment variables used by the policies endpoint.
 *
 * @returns The policies endpoint environment schema.
 */
export const envSchema = cacheConfigSchema.safeExtend({
	POLICIES_ENDPOINT_ENABLED: z.boolean().default(true),
	DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY: z.boolean().default(false),
	CACHE_ENABLED: z.boolean().default(true),
})
