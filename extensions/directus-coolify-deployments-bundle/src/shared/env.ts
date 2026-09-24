/**
 * Preserves this bundle's enabled-by-default cache setting before shared cache validation.
 * @param env - Directus environment values.
 * @returns Environment values with the Coolify cache default applied.
 */
export function withCoolifyCacheDefault(env: Record<string, unknown>): Record<string, unknown> {
	return { ...env, CACHE_ENABLED: env.CACHE_ENABLED === undefined ? true : env.CACHE_ENABLED }
}
