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

export type RedisConfig = z.output<typeof redisConfigSchema>

/**
 * Resolves Directus Redis environment values to a connection URL.
 * @param options - Validated Redis environment values.
 * @param store - A synchronization store that may enable Redis without REDIS_ENABLED.
 * @returns A Redis connection URL, or undefined when Redis is disabled.
 */
export function resolveRedisConnectionString(
	options: RedisConfig,
	store: 'memory' | 'redis' = 'memory',
): string | undefined {
	if (options.REDIS?.trim()) return options.REDIS.trim()
	if (!options.REDIS_ENABLED && store !== 'redis') return undefined

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
