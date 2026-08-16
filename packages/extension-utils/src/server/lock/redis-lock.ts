import type { LockAcquireOptions, LockLease, LockProvider } from './lock-core'

import { createKv } from '@directus/memory'
import Redis from 'ioredis'

import { attempt } from '../../shared/attempt'
import { isFiniteNumber, isFunction, isNonBlankString, isString } from '../../shared/guards'
import { createLockToken, validateLeaseMs, validateLockName } from './lock-core'

/** Options for the Redis-backed lock provider. */
export interface RedisLockProviderOptions {
	/** Redis connection URL. The provider owns the created connection. */
	redisUrl: string
	/** Namespace used for lock keys. Defaults to `directus:locks`. */
	namespace?: string
	/** Default lock lifetime in milliseconds. Defaults to 30 seconds. */
	lockTimeoutMs?: number
	/** Identifies backend errors that represent lock contention. */
	isContentionError?: (error: unknown) => boolean
	/** @internal Reuses a connection owned by a higher-level server storage factory. */
	redis?: Redis
}

/** Redis lock provider with explicit connection cleanup. */
export interface RedisLockProvider extends LockProvider {
	/** Closes the Redis connection created by this provider. */
	dispose(): Promise<void>
}

interface RedisLockConfig {
	redisUrl: string
	namespace: string
	lockTimeoutMs: number
	isContentionError: (error: unknown) => boolean
}

interface RedisLockDependencies {
	config: RedisLockConfig
	redis: Redis
	isDisposed: () => boolean
}

/**
 * Re-throws an attempted Redis failure as an Error.
 * @param error - Failure captured by `attempt`.
 * @returns Never returns.
 */
const raiseRedisError = (error: unknown): never => {
	if (error instanceof Error) throw error
	throw new Error(String(error))
}

/**
 * Validates and normalizes Redis lock configuration.
 * @param options - Redis provider options.
 * @returns Validated Redis configuration.
 */
const validateRedisConfig = (options: RedisLockProviderOptions): RedisLockConfig => {
	if (!isString(options.redisUrl) || !isNonBlankString(options.redisUrl)) {
		throw new TypeError('Redis URL must not be empty')
	}
	const namespace = options.namespace ?? 'directus:locks'
	if (!isString(namespace) || !isNonBlankString(namespace)) {
		throw new TypeError('Lock namespace must not be empty')
	}
	const lockTimeoutMs = options.lockTimeoutMs ?? 30_000
	if (!isFiniteNumber(lockTimeoutMs) || lockTimeoutMs <= 0) {
		throw new RangeError('Lock lockTimeoutMs must be a finite positive number')
	}
	const isContentionError = options.isContentionError ?? defaultContentionError
	if (!isFunction(isContentionError))
		throw new TypeError('Contention error handler must be a function')

	return {
		redisUrl: options.redisUrl.trim(),
		namespace,
		lockTimeoutMs,
		isContentionError,
	}
}

/**
 * Identifies Directus KV contention errors by their documented error name.
 * @param error - Unknown backend failure.
 * @returns Whether the error represents contention.
 */
const defaultContentionError = (error: unknown): boolean =>
	error instanceof Error && error.name === 'ExecutionError'

/**
 * Creates an owner-bound Redis lease around a Directus KV lock.
 * @param name - Normalized lock name.
 * @param leaseMs - Lease duration.
 * @param lock - Directus KV lock.
 * @returns An owner-bound lock lease.
 */
const createRedisLease = (
	name: string,
	leaseMs: number,
	lock: { extend(ms: number): Promise<void>; release(): Promise<void> },
): LockLease => {
	let released = false
	const token = createLockToken()

	return {
		name,
		token,
		renew: async () => {
			if (released) return false
			await lock.extend(leaseMs)
			return true
		},
		release: async () => {
			if (released) return false
			released = true
			await lock.release()
			return true
		},
	}
}

/**
 * Acquires one Redis lock and maps configured contention failures to `null`.
 * @param dependencies - Redis provider dependencies.
 * @param name - Lock name.
 * @param acquireOptions - Lock acquisition options.
 * @returns An owner-bound lock lease or `null` on contention.
 */
const acquireRedisLock = async (
	dependencies: RedisLockDependencies,
	name: string,
	acquireOptions: LockAcquireOptions,
): Promise<LockLease | null> => {
	const { config, redis, isDisposed } = dependencies
	if (isDisposed()) throw new Error('Redis lock provider has been disposed')
	const normalizedName = validateLockName(name)
	const leaseMs = validateLeaseMs(acquireOptions.leaseMs ?? config.lockTimeoutMs)
	const key = `${config.namespace}:${encodeURIComponent(normalizedName)}`

	const result = await attempt(async () => {
		const kv = createKv({
			type: 'redis',
			namespace: config.namespace,
			redis,
			lockTimeout: leaseMs,
		})
		const lock = await kv.acquireLock(key)
		return createRedisLease(normalizedName, leaseMs, lock)
	})

	if (result.error === null) return result.data
	if (config.isContentionError(result.error)) return null
	return raiseRedisError(result.error)
}

/**
 * Creates a lock provider backed by Directus' Redis KV implementation.
 *
 * The provider creates and owns the Redis connection unless an internal higher-level provider
 * supplies one. Only errors identified as contention are converted to `null`.
 *
 * @param options - Redis connection and lock configuration.
 * @returns A Redis-backed lock provider.
 */
export function createRedisLockProvider(options: RedisLockProviderOptions): RedisLockProvider {
	const config = validateRedisConfig(options)
	const ownsRedis = options.redis === undefined
	const redis = options.redis ?? new Redis(config.redisUrl)
	let disposed = false
	const dependencies: RedisLockDependencies = {
		config,
		redis,
		isDisposed: () => disposed,
	}

	return {
		tryAcquire: (name, acquireOptions = {}) =>
			acquireRedisLock(dependencies, name, acquireOptions),
		dispose: async () => {
			if (disposed) return
			disposed = true
			if (ownsRedis) await redis.quit()
		},
	}
}
