import {
	cacheConfig,
	defineExtensionOptionsSchema,
} from '@onderwijsin/directus-extension-utils/server'

/**
 * Validates the environment variables used by the policies endpoint.
 *
 * @returns The policies endpoint environment definition.
 */
export const envSchema = defineExtensionOptionsSchema({
	include: [cacheConfig],
	/**
	 * Builds endpoint fields with the shared package's Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Policies endpoint environment fields.
	 */
	options: (z) => ({
		POLICIES_ENDPOINT_ENABLED: z.boolean().default(true),
		DIRECTUS_POLICIES_ENDPOINT_BYPASS_ACCOUNTABILITY: z.boolean().default(false),
		DIRECTUS_POLICY_CACHE_INVALIDATION_ENABLED: z.boolean().default(true),
	}),
})

/**
 * Preserves the policies bundle's enabled-by-default cache setting before shared cache validation.
 * @param env - Directus environment values.
 * @returns Environment values with the policies cache default applied.
 */
export function withPoliciesCacheDefault(env: Record<string, unknown>): Record<string, unknown> {
	return { ...env, CACHE_ENABLED: env.CACHE_ENABLED === undefined ? true : env.CACHE_ENABLED }
}
