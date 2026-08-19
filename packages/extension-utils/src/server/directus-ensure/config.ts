import { z } from 'zod'

import { redisUrlSchema, resolveRedisConnectionString } from '../config/redis'
import { synchronizationConfigSchema } from '../config/synchronization'

/** Supported providers for Directus startup coordination. */
export const startupLockProviderSchema = z.enum(['memory', 'redis', 'fs'])

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
		DIRECTUS_EXTENSIONS_LOCK_PROVIDER: startupLockProviderSchema.optional(),
		DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: redisUrlSchema.optional(),
		DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: z.string().trim().min(1).optional(),
		DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: extensionRateLimiterStoreSchema.optional(),
		...synchronizationConfigSchema.shape,
	})
	.superRefine((options, context) => {
		let redisConnection: string | undefined
		try {
			redisConnection = resolveRedisConnectionString(options, options.SYNCHRONIZATION_STORE)
		} catch {
			redisConnection = undefined
		}
		if (
			(options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER ?? options.SYNCHRONIZATION_STORE) ===
				'redis' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_REDIS_URL &&
			!redisConnection
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_REDIS_URL'],
				message:
					'DIRECTUS_EXTENSIONS_LOCK_REDIS_URL or resolved Redis configuration is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is redis',
			})
		}
		if (
			options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER === 'fs' &&
			!options.DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY
		) {
			context.addIssue({
				code: 'custom',
				path: ['DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY'],
				message: 'is required when DIRECTUS_EXTENSIONS_LOCK_PROVIDER is fs',
			})
		}
		if (
			(options.DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE ?? options.SYNCHRONIZATION_STORE) ===
				'redis' &&
			!redisConnection
		) {
			context.addIssue({
				code: 'custom',
				path: ['REDIS'],
				message:
					'Redis configuration is required when the effective rate limiter store is redis',
			})
		}
	})

export type DirectusStartupOptions = z.output<typeof directusStartupSchema>

/**
 * Resolves the extension startup lock provider using local and global fallbacks.
 * @param options - Startup configuration containing local and global store choices.
 * @returns The effective startup lock provider.
 */
export function resolveStartupLockProvider(
	options: Pick<
		DirectusStartupOptions,
		'DIRECTUS_EXTENSIONS_LOCK_PROVIDER' | 'SYNCHRONIZATION_STORE'
	>,
): z.output<typeof startupLockProviderSchema> {
	return options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER ?? options.SYNCHRONIZATION_STORE
}

/**
 * Resolves the extension rate-limiter store using local and global fallbacks.
 * @param options - Startup configuration containing local and global store choices.
 * @returns The effective rate-limiter store.
 */
export function resolveExtensionRateLimiterStore(
	options: Pick<
		DirectusStartupOptions,
		'DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE' | 'SYNCHRONIZATION_STORE'
	>,
): z.output<typeof extensionRateLimiterStoreSchema> {
	return options.DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE ?? options.SYNCHRONIZATION_STORE
}

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
