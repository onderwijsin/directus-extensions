import type { Cache } from '@directus/memory'
import type { ApiExtensionContext } from '@directus/types'
import type { RegisterFunctions } from '../types'

import { createCache } from '@directus/memory'
import Redis from 'ioredis'
import { z } from 'zod'

import { isRecord, isString } from '../shared'
import { isArray, isFiniteNumber, toEntries } from '../shared'
import {
	cacheConfigSchema,
	resolveCacheStorage,
	resolveRedisConnectionString,
	type RedisConfig,
} from './config/cache'

const CACHE_NAMESPACE = 'directus:extensions'

/** Environment values used to select and configure an extension cache backend. */
export type CacheEnv = z.input<typeof cacheConfigSchema>

/** Options used when initializing an extension cache. */
export interface CacheOptions {
	/** Default cache entry time-to-live in milliseconds. */
	ttl: number
	/** Namespace used for the cache keys. */
	namespace?: string
}

/** Options used for a single cached operation. */
export interface WithCacheOptions {
	/** Cache backend. A null value disables caching. */
	cache: Cache | null

	/** Cache key used to read and store the operation result. */
	key: string
}

/** Supported collection configuration used for cache invalidation hooks. */
export type CollectionInput =
	| string
	| string[]
	| {
			collection: string
			create?: boolean
			update?: boolean
			delete?: boolean
			isSystem?: boolean
	  }

/** Options used when registering collection cache invalidation. */
export interface CollectionCacheInvalidationOptions {
	/** Cache backend. A null value disables cache invalidation. */
	cache: Cache | null

	/**
	 * Resolves the cache key associated with a mutated collection.
	 *
	 * @param collection - Collection associated with the mutation.
	 * @returns The cache key to invalidate.
	 */
	key: (collection: string) => string
}

/**
 * Creates the configured Directus extension cache.
 *
 * Redis-backed caches use a shared extension namespace to prevent collisions
 * with other Directus cache consumers. When caching is disabled through
 * configuration, this function returns null.
 *
 * @param env - Environment values used to configure the cache backend.
 * @param options - Cache initialization options.
 * @returns A configured cache instance, or null when caching is disabled.
 * @throws {TypeError} When the configured TTL is not a finite positive number.
 * @throws {Error} When Redis is selected without a valid Redis connection configuration.
 *
 * @example
 * const cache = initializeCache(context.env, {
 * 	ttl: 60_000,
 * })
 */
export function initializeCache(env: CacheEnv, options: CacheOptions): Cache | null {
	if (!isFiniteNumber(options.ttl) || options.ttl <= 0) {
		throw new TypeError('Cache ttl must be a finite positive number')
	}

	const config = cacheConfigSchema.parse(env)
	const storage = resolveCacheStorage(config)

	if (storage === 'redis') {
		const redisUrl = resolveRedisConnectionString(config)

		if (!redisUrl) {
			throw new Error('Redis cache requires REDIS or all Redis component values')
		}

		return createCache({
			type: 'redis',
			namespace: options.namespace ?? CACHE_NAMESPACE,
			redis: new Redis(redisUrl),
			ttl: options.ttl,
		})
	}

	if (storage === 'memory') {
		return createCache({
			type: 'local',
			ttl: options.ttl,
		})
	}

	return null
}

/**
 * Resolves a value from cache or computes and stores it on a cache miss.
 *
 * When caching is disabled, the handler is executed directly without attempting
 * any cache reads or writes.
 *
 * @param options - Cache backend and cache key for the operation.
 * @param handler - Asynchronous operation used to compute the value on a cache miss.
 * @returns The cached value, or the freshly computed value on a cache miss.
 *
 * @example
 * const key = `fields:${collection}`
 *
 * const fields = await withCache(
 * 	{
 * 		cache,
 * 		key,
 * 	},
 * 	() => fieldsService.readAll(collection),
 * )
 */
export async function withCache<TResult>(
	options: WithCacheOptions,
	handler: () => Promise<TResult>,
): Promise<TResult> {
	const { cache, key } = options

	if (!cache) {
		return handler()
	}

	const cached = await cache.get<TResult>(key)

	if (cached !== undefined) {
		return cached
	}

	const result = await handler()

	await cache.set(key, result)

	return result
}

/**
 * Maps collection input to valid Directus hook event targets.
 *
 * String inputs are treated as regular collections and expanded to
 * `items.<collection>.<event>` targets for create, update, and delete.
 *
 * String arrays are assumed to already contain complete hook event targets
 * and are returned unchanged. This allows targeting arbitrary Directus events.
 *
 * Object inputs allow selecting individual events. Regular collections use
 * the `items.<collection>.<event>` format, while system collections use
 * `<collection>.<event>`.
 *
 * @param input - Collection name, explicit hook event targets, or collection configuration.
 * @returns A normalized array of Directus hook event targets.
 *
 * @example
 * // Regular collection with all supported item events.
 * mapCollectionInputToHookEvents('articles')
 * // => [
 * //   'items.articles.create',
 * //   'items.articles.update',
 * //   'items.articles.delete',
 * // ]
 *
 * @example
 * // Explicit hook event targets are returned unchanged.
 * mapCollectionInputToHookEvents([
 * 	'users.create',
 * 	'users.update',
 * ])
 * // => ['users.create', 'users.update']
 *
 * @example
 * // Select specific events for a regular collection.
 * mapCollectionInputToHookEvents({
 * 	collection: 'articles',
 * 	create: true,
 * 	update: true,
 * })
 * // => [
 * //   'items.articles.create',
 * //   'items.articles.update',
 * // ]
 *
 * @example
 * // Select specific events for a system collection.
 * mapCollectionInputToHookEvents({
 * 	collection: 'users',
 * 	create: true,
 * 	delete: true,
 * 	isSystem: true,
 * })
 * // => [
 * //   'users.create',
 * //   'users.delete',
 * // ]
 */
export function mapCollectionInputToHookEvents(input: CollectionInput): string[] {
	if (isString(input)) {
		return ['create', 'update', 'delete'].map((event) => `items.${input}.${event}`)
	}

	if (isArray(input) && input.every(isString)) {
		return input
	}

	const { collection, isSystem, ...events } = input

	return toEntries(events)
		.filter(([_, enabled]) => enabled)
		.map(([event]) => (isSystem ? `${collection}.${event}` : `items.${collection}.${event}`))
}

/**
 * Registers cache invalidation hooks for collection mutation events.
 *
 * Each configured Directus action hook invalidates the cache entry associated
 * with the mutated collection. Invalidation runs after the mutation and is
 * intentionally non-blocking: cache deletion failures are logged without
 * failing the originating Directus operation.
 *
 * When caching is disabled, no invalidation hooks are registered.
 *
 * @param collection - Collection events for which invalidation should be registered.
 * @param options - Cache backend and function used to derive cache keys.
 * @param hook - Directus hook registration functions.
 * @param context - Directus extension context used for logging.
 * @returns Nothing.
 *
 * @example
 * const fieldsCacheKey = (collection: string): string =>
 * 	`fields:${collection}`
 *
 * const cache = initializeCache(context.env, {
 * 	ttl: 60_000,
 * })
 *
 * registerCollectionCacheInvalidation(
 * 	'articles',
 * 	{
 * 		cache,
 * 		key: fieldsCacheKey,
 * 	},
 * 	hook,
 * 	context,
 * )
 */
export function registerCollectionCacheInvalidation(
	collection: CollectionInput,
	options: CollectionCacheInvalidationOptions,
	hook: RegisterFunctions,
	context: ApiExtensionContext,
): void {
	const { cache, key } = options

	if (!cache) {
		return
	}

	const events = mapCollectionInputToHookEvents(collection)

	for (const event of events) {
		hook.action(event, (meta) => {
			const collection = isRecord(meta) ? meta.collection : undefined

			if (!isString(collection)) {
				return
			}

			void cache.delete(key(collection)).catch((error: unknown) => {
				context.logger.error('Failed to invalidate extension cache.', {
					collection,
					error,
				})
			})
		})
	}
}

export type { RedisConfig }
