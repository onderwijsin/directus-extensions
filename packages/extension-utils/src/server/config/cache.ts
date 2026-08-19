import { z } from 'zod'

const nonBlankStringSchema = z.string().trim().min(1)

const redisUrlSchema = nonBlankStringSchema.refine((value) => {
	try {
		const url = new URL(value)
		return url.protocol === 'redis:' || url.protocol === 'rediss:'
	} catch {
		return false
	}
}, 'must be a valid redis:// or rediss:// URL')

const redisHostSchema = nonBlankStringSchema.refine(
	(value) => !/\s/u.test(value),
	'must not contain whitespace',
)

const redisPortSchema = z.coerce.number().int().min(1).max(65_535)

/** Redis environment values supported by Directus. */
export const redisConfigSchema = z.object({
	REDIS_ENABLED: z.boolean().default(false),
	REDIS: redisUrlSchema.optional(),
	REDIS_HOST: redisHostSchema.optional(),
	REDIS_PORT: redisPortSchema.optional(),
	REDIS_USERNAME: nonBlankStringSchema.optional(),
	REDIS_PASSWORD: nonBlankStringSchema.optional(),
})

/** Directus cache and Redis environment values used by extension consumers. */
export const cacheConfigSchema = z
	.object({
		CACHE_ENABLED: z.boolean().default(false),
		CACHE_STORE: z.enum(['memory', 'redis']).default('memory'),
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

export type RedisConfig = z.output<typeof redisConfigSchema>
export type CacheConfig = z.output<typeof cacheConfigSchema>

/**
 * Resolves Directus Redis environment values to a connection URL.
 * @param options - Validated Redis environment values.
 * @returns A Redis connection URL, or undefined when Redis is disabled.
 */
export function resolveRedisConnectionString(options: RedisConfig): string | undefined {
	if (options.REDIS?.trim()) return options.REDIS.trim()
	if (!options.REDIS_ENABLED) return undefined

	const components = [
		options.REDIS_HOST,
		options.REDIS_PORT,
		options.REDIS_USERNAME,
		options.REDIS_PASSWORD,
	]
	if (components.some((value) => value === undefined)) {
		throw new Error(
			'REDIS_HOST, REDIS_PORT, REDIS_USERNAME, and REDIS_PASSWORD are required to construct a Redis connection',
		)
	}
	const { REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD } = options
	if (
		REDIS_HOST === undefined ||
		REDIS_PORT === undefined ||
		REDIS_USERNAME === undefined ||
		REDIS_PASSWORD === undefined
	) {
		throw new Error('Redis components are incomplete')
	}

	return `redis://${encodeURIComponent(REDIS_USERNAME)}:${encodeURIComponent(REDIS_PASSWORD)}@${REDIS_HOST}:${REDIS_PORT}`
}

/**
 * Resolves the public cache storage choice while validating Redis availability.
 * @param options - Validated cache environment values.
 * @returns The public cache store, or null when caching is disabled.
 */
export function resolveCacheStorage(options: CacheConfig): 'memory' | 'redis' | null {
	if (!options.CACHE_ENABLED) return null
	if (options.CACHE_STORE === 'memory') return 'memory'
	if (!resolveRedisConnectionString(options)) {
		throw new Error('Redis cache requires REDIS or all Redis component values')
	}
	return 'redis'
}
