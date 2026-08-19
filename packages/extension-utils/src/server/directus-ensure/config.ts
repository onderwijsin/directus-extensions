import { z } from 'zod'

/** Supported providers for Directus startup coordination. */
export const startupLockProviderSchema = z.enum(['MEMORY', 'REDIS', 'FS'])

/** Supported stores for extension-owned rate limiters. */
export const extensionRateLimiterStoreSchema = z.enum(['memory', 'redis'])

/**
 * Validates shared Directus startup configuration.
 *
 * @returns Validated configuration for startup coordination and rate limiting.
 */
export const directusStartupSchema = z
	.object({
		DIRECTUS_EXTENSION_ID: z.string().optional(),
		DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: z.boolean().default(true),
		DIRECTUS_EXTENSIONS_LOCK_PROVIDER: startupLockProviderSchema.default('MEMORY'),
		DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: z.string().trim().min(1).optional(),
		DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: z.string().trim().min(1).optional(),
		DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: extensionRateLimiterStoreSchema.default('memory'),
		REDIS: z.string().trim().min(1).optional(),
	})
	.superRefine((options, context) => {
		if (
			options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER === 'REDIS' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL &&
			!options.REDIS
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_REDIS_URL'],
				message:
					'DIRECTUS_EXTENSIONS_LOCK_REDIS_URL or REDIS is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is REDIS',
			})
		}
		if (
			options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER === 'FS' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY'],
				message: 'is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is FS',
			})
		}
		if (options.DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE === 'redis' && !options.REDIS) {
			context.addIssue({
				code: 'custom',
				path: ['REDIS'],
				message: 'is required when DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE is redis',
			})
		}
	})

export type DirectusStartupOptions = z.output<typeof directusStartupSchema>

/** Shared lock namespace for extension startup operations. */
export const DIRECTUS_EXTENSION_STARTUP_LOCK = 'directus-extension-startup'

/**
 * Builds the lock name for one extension's startup operations.
 * @param name - Extension identifier.
 * @returns The namespaced startup lock name.
 */
export function getDirectusStartupLockName(name: string): string {
	return DIRECTUS_EXTENSION_STARTUP_LOCK + ':' + name
}
