import { z } from 'zod'

import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'

/**
 * Creates a non-blank string schema with the supplied runtime.
 * @param zod - Package-owned Zod runtime.
 * @returns A trimmed non-blank string schema.
 */
const createNonBlankStringSchema = (zod: typeof z) => zod.string().trim().min(1)

/**
 * Creates the Redis URL schema with the supplied runtime.
 * @param zod - Package-owned Zod runtime.
 * @returns A schema accepting Redis and secure Redis URLs.
 */
const createRedisUrlSchema = (zod: typeof z) =>
	createNonBlankStringSchema(zod).refine((value) => {
		try {
			const url = new URL(value)
			return url.protocol === 'redis:' || url.protocol === 'rediss:'
		} catch {
			return false
		}
	}, 'must be a valid redis:// or rediss:// URL')

export const redisUrlSchema = createRedisUrlSchema(z)

/**
 * Builds the Redis configuration fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The shared Redis configuration shape.
 */
const defineRedisConfigShape = (zod: typeof z) => {
	const nonBlankStringSchema = createNonBlankStringSchema(zod)
	const redisHostSchema = nonBlankStringSchema.refine(
		(value) => !/\s/u.test(value),
		'must not contain whitespace',
	)
	const redisPortSchema = zod.coerce.number().int().min(1).max(65_535)

	return {
		REDIS_ENABLED: zod.boolean().default(false),
		REDIS: createRedisUrlSchema(zod).optional(),
		REDIS_HOST: redisHostSchema.optional(),
		REDIS_PORT: redisPortSchema.optional(),
		REDIS_USERNAME: nonBlankStringSchema.optional(),
		REDIS_PASSWORD: nonBlankStringSchema.optional(),
	}
}

/** Redis environment values supported by Directus. */
export const redisConfigSchema = z.object(defineRedisConfigShape(z))

export type RedisConfig = z.output<typeof redisConfigSchema>

/** Shared Directus Redis configuration for declarative options composition. */
export const redisConfig = createExtensionOptionsConfigFragment<RedisConfig>({
	name: 'redisConfig',
	shape: defineRedisConfigShape,
})

/**
 * Defines extension options that include the shared Redis configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineRedisConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(redisConfig, builder)

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
