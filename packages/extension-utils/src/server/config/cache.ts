import { z } from 'zod'

import { defineExtensionOptionsShape, type ExtensionOptionsShapeBuilder } from '../schema-builder'
import { redisConfigSchema, resolveRedisConnectionString, type RedisConfig } from './redis'

/** Directus cache and Redis environment values used by extension consumers. */
export const cacheConfigSchema = z
	.object({
		CACHE_ENABLED: z.boolean().default(false),
		CACHE_STORE: z.enum(['memory', 'redis']).optional(),
	})
	.extend(redisConfigSchema.shape)
	.superRefine((options, context) => {
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
				message:
					'REDIS or all Redis component values are required when REDIS_ENABLED is true',
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
	})

export type CacheConfig = z.output<typeof cacheConfigSchema>
export type { RedisConfig }
export { redisConfigSchema, resolveRedisConnectionString }

/**
 * Defines extension options that include the shared cache configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineCacheConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(cacheConfigSchema, builder)

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
