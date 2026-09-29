import { z } from 'zod'

import { redisUrlSchema, resolveRedisConnectionString } from '../config/redis'
import { synchronizationConfig, synchronizationConfigSchema } from '../config/synchronization'
import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsRefinementContext,
	type ExtensionOptionsRefinementValues,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'

/**
 * Creates the startup lock provider schema with the supplied runtime.
 * @param zod - Package-owned Zod runtime.
 * @returns A startup lock provider schema.
 */
const createStartupLockProviderSchema = (zod: typeof z) => zod.enum(['memory', 'redis', 'fs'])

/**
 * Creates the extension rate-limiter store schema with the supplied runtime.
 * @param zod - Package-owned Zod runtime.
 * @returns A rate-limiter store schema.
 */
const createExtensionRateLimiterStoreSchema = (zod: typeof z) => zod.enum(['memory', 'redis'])

/** Supported providers for Directus startup coordination. */
export const startupLockProviderSchema = createStartupLockProviderSchema(z)

/** Supported stores for extension-owned rate limiters. */
export const extensionRateLimiterStoreSchema = createExtensionRateLimiterStoreSchema(z)

/**
 * Builds Directus startup fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The Directus startup configuration shape.
 */
const defineDirectusStartupConfigShape = (zod: typeof z) => ({
	DIRECTUS_EXTENSION_ID: zod.string().optional(),
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: zod.boolean().default(true),
	DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: zod.boolean().default(true),
	DIRECTUS_EXTENSIONS_LOCK_PROVIDER: createStartupLockProviderSchema(zod).optional(),
	DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: redisUrlSchema.optional(),
	DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: zod.string().trim().min(1).optional(),
	DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: createExtensionRateLimiterStoreSchema(zod).optional(),
})

const directusStartupBaseSchema = z.object({
	...defineDirectusStartupConfigShape(z),
	...synchronizationConfigSchema.shape,
})

/**
 * Validates Directus startup provider cross-field requirements.
 * @param options - Parsed startup, synchronization, and Redis options.
 * @param context - Refinement issue collector.
 * @returns Nothing.
 */
const refineDirectusStartupConfig = (
	options: ExtensionOptionsRefinementValues,
	context: ExtensionOptionsRefinementContext,
): void => {
	let redisConnection: string | undefined
	try {
		redisConnection = resolveRedisConnectionString(
			{
				REDIS: typeof options.REDIS === 'string' ? options.REDIS : undefined,
				REDIS_ENABLED: options.REDIS_ENABLED === true,
				REDIS_HOST: typeof options.REDIS_HOST === 'string' ? options.REDIS_HOST : undefined,
				REDIS_PASSWORD:
					typeof options.REDIS_PASSWORD === 'string' ? options.REDIS_PASSWORD : undefined,
				REDIS_PORT: typeof options.REDIS_PORT === 'number' ? options.REDIS_PORT : undefined,
				REDIS_USERNAME:
					typeof options.REDIS_USERNAME === 'string' ? options.REDIS_USERNAME : undefined,
			},
			options.SYNCHRONIZATION_STORE === 'redis' ? 'redis' : 'memory',
		)
	} catch {
		redisConnection = undefined
	}
	if (
		(options.DIRECTUS_EXTENSIONS_LOCK_PROVIDER ?? options.SYNCHRONIZATION_STORE) === 'redis' &&
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
}

/**
 * Validates shared Directus startup configuration.
 *
 * @returns Validated configuration for startup coordination and rate limiting.
 */
export const directusStartupSchema = directusStartupBaseSchema.superRefine(
	refineDirectusStartupConfig,
)

export type DirectusStartupOptions = z.output<typeof directusStartupSchema>

/** Shared Directus startup configuration for declarative options composition. */
export const directusStartupConfig = createExtensionOptionsConfigFragment<DirectusStartupOptions>({
	dependencies: [synchronizationConfig],
	name: 'directusStartupConfig',
	refine: refineDirectusStartupConfig,
	shape: defineDirectusStartupConfigShape,
})

/**
 * Defines extension options that include the shared Directus startup configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineDirectusStartupSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(directusStartupConfig, builder)

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
