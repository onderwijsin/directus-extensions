import { z } from 'zod'

import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsRefinementContext,
	type ExtensionOptionsRefinementValues,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'
import {
	redisConfig,
	redisConfigSchema,
	resolveRedisConnectionString,
	type RedisConfig,
} from './redis'

/**
 * Builds cache fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The cache configuration shape.
 */
const defineCacheConfigShape = (zod: typeof z) => ({
	CACHE_ENABLED: zod.boolean().default(false),
	CACHE_STORE: zod.enum(['memory', 'redis']).optional(),
})

const cacheConfigBaseSchema = z.object(defineCacheConfigShape(z)).extend(redisConfigSchema.shape)

/**
 * Validates cache and Redis cross-field requirements.
 * @param options - Parsed shared cache and Redis options.
 * @param context - Refinement issue collector.
 * @returns Nothing.
 */
const refineCacheConfig = (
	options: ExtensionOptionsRefinementValues,
	context: ExtensionOptionsRefinementContext,
): void => {
	const components = [
		options.REDIS_HOST,
		options.REDIS_PORT,
		options.REDIS_USERNAME,
		options.REDIS_PASSWORD,
	]
	const hasComponents = components.some((value) => value !== undefined)
	const hasAllComponents = components.every((value) => value !== undefined)

	if (hasComponents && !hasAllComponents) {
		context.addIssue({
			code: 'custom',
			path: ['REDIS_HOST'],
			message:
				'REDIS_HOST, REDIS_PORT, REDIS_USERNAME, and REDIS_PASSWORD are required together',
		})
	}
	if (options.REDIS_ENABLED && !options.REDIS && !hasAllComponents) {
		context.addIssue({
			code: 'custom',
			path: ['REDIS'],
			message: 'REDIS or all Redis component values are required when REDIS_ENABLED is true',
		})
	}
	if (options.CACHE_STORE === 'redis' && !options.REDIS && !hasAllComponents) {
		context.addIssue({
			code: 'custom',
			path: ['CACHE_STORE'],
			message: 'Redis configuration is required when CACHE_STORE is redis',
		})
	}
	if (options.CACHE_STORE === 'redis' && !options.REDIS && !options.REDIS_ENABLED) {
		context.addIssue({
			code: 'custom',
			path: ['REDIS_ENABLED'],
			message: 'must be true when CACHE_STORE is redis and REDIS is not supplied',
		})
	}
}

/** Directus cache and Redis environment values used by extension consumers. */
export const cacheConfigSchema = cacheConfigBaseSchema.superRefine(refineCacheConfig)

export type CacheConfig = z.output<typeof cacheConfigSchema>
export type { RedisConfig }
export { redisConfigSchema, resolveRedisConnectionString }

/** Shared cache and Redis configuration for declarative options composition. */
export const cacheConfig = createExtensionOptionsConfigFragment<CacheConfig>({
	dependencies: [redisConfig],
	name: 'cacheConfig',
	refine: refineCacheConfig,
	shape: defineCacheConfigShape,
})

/**
 * Defines extension options that include the shared cache configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineCacheConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(cacheConfig, builder)

/**
 * Resolves the public cache storage choice while validating Redis availability.
 * @param options - Validated cache environment values.
 * @param synchronizationStore - Global fallback when no local cache store is configured.
 * @returns The public cache store, or null when caching is disabled.
 */
export function resolveCacheStorage(options: CacheConfig): 'memory' | 'redis' | null {
	if (!options.CACHE_ENABLED) return null
	const store = options.CACHE_STORE ?? 'memory'
	if (store === 'memory') return 'memory'
	if (!resolveRedisConnectionString(options)) {
		throw new Error('Redis cache requires REDIS or all Redis component values')
	}
	return 'redis'
}
