import { generateUUID } from './uuid'

/** Options controlling the lifetime of an acquired lock lease. */
export interface LockAcquireOptions {
	/** Lease lifetime in milliseconds. Defaults to 30 seconds. */
	leaseMs?: number
}

/** An owner-bound lock lease. */
export interface LockLease {
	/** Normalized lock name. */
	readonly name: string
	/** Unique owner token for this lease generation. */
	readonly token: string
	/** Extends the lease when this token still owns the lock. */
	renew(): Promise<boolean>
	/** Releases the lock only when this token still owns it. */
	release(): Promise<boolean>
}

/** Provider-independent lock contract. */
export interface LockProvider {
	/** Acquires a lock or returns `null` when another owner holds it. */
	tryAcquire(name: string, options?: LockAcquireOptions): Promise<LockLease | null>
}

/** Standard lock name used by Tio for bulk operations. */
export const BULK_OPERATION_LOCK = 'bulk-operation'

/** Options for deterministic in-memory lock providers. */
export interface MemoryLockProviderOptions {
	/** Injectable clock returning milliseconds since epoch. */
	now?: () => number
	/** Injectable owner-token factory. */
	tokenFactory?: () => string
}

interface MemoryLockRecord {
	token: string
	expiresAt: number
}

const DEFAULT_LEASE_MS = 30_000

/** Normalizes and validates a logical lock name.
 * @param name - Lock name to validate.
 * @returns The normalized name.
 */
const validateName = (name: string): string => {
	const normalized = name.trim()
	if (normalized.length === 0) throw new TypeError('Lock name must not be empty')
	return normalized
}

/** Validates a positive lock lease duration.
 * @param leaseMs - Lease duration.
 * @returns The validated duration.
 */
const validateLeaseMs = (leaseMs: number | undefined): number => {
	const value = leaseMs ?? DEFAULT_LEASE_MS
	if (!Number.isFinite(value) || value <= 0) {
		throw new RangeError('Lock leaseMs must be a finite positive number')
	}
	return value
}

/** Creates an owner-bound lease over one process-local lock record.
 * @param name - Normalized lock name.
 * @param token - Owner token.
 * @param leaseMs - Lease duration.
 * @param now - Clock provider.
 * @param locks - Process-local lock records.
 * @returns An owner-bound lease.
 */
const createMemoryLease = (
	name: string,
	token: string,
	leaseMs: number,
	now: () => number,
	locks: Map<string, MemoryLockRecord>,
): LockLease => {
	let released = false

	return {
		name,
		token,
		async renew() {
			if (released) return false
			const currentTime = now()
			const record = locks.get(name)
			if (!record || record.token !== token || record.expiresAt <= currentTime) {
				if (record?.token === token) locks.delete(name)
				return false
			}
			record.expiresAt = currentTime + leaseMs
			return true
		},
		async release() {
			if (released) return false
			released = true
			const currentTime = now()
			const record = locks.get(name)
			if (!record || record.token !== token || record.expiresAt <= currentTime) {
				if (record?.token === token) locks.delete(name)
				return false
			}
			locks.delete(name)
			return true
		},
	}
}

/**
 * Creates a process-local lock provider.
 *
 * This provider coordinates only callers sharing the returned provider instance. It is not safe
 * for multiple processes or Directus replicas.
 *
 * @param options - Optional clock and token configuration.
 * @returns A process-local lock provider.
 */
export function createMemoryLockProvider(options: MemoryLockProviderOptions = {}): LockProvider {
	const locks = new Map<string, MemoryLockRecord>()
	const now = options.now ?? Date.now
	const tokenFactory = options.tokenFactory ?? generateUUID

	return {
		tryAcquire: async (name, acquireOptions = {}) => {
			const normalizedName = validateName(name)
			const leaseMs = validateLeaseMs(acquireOptions.leaseMs)
			const currentTime = now()
			const current = locks.get(normalizedName)
			if (current && current.expiresAt > currentTime) return null
			if (current) locks.delete(normalizedName)

			const token = tokenFactory()
			locks.set(normalizedName, { token, expiresAt: currentTime + leaseMs })
			return createMemoryLease(normalizedName, token, leaseMs, now, locks)
		},
	}
}

/** Minimal Redis-compatible client required by the distributed lock provider. */
export interface RedisLockClient {
	set(key: string, value: string, ...arguments_: unknown[]): Promise<unknown>
	eval(script: string, numberOfKeys: number, ...arguments_: unknown[]): Promise<unknown>
}

/** Options for the injected Redis lock provider. */
export interface RedisLockProviderOptions {
	/** Prefix shared by all keys created by this provider. */
	keyPrefix?: string
	/** Injectable owner-token factory. */
	tokenFactory?: () => string
}

const RENEW_SCRIPT =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end"
const RELEASE_SCRIPT =
	"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

/** Interprets Redis integer replies used by renewal and release scripts.
 * @param result - Redis reply.
 * @returns Whether the operation succeeded.
 */
const redisResultSucceeded = (result: unknown): boolean => Number(result) === 1

/**
 * Creates a distributed lock provider backed by an injected Redis-compatible client.
 *
 * Acquisition uses `SET key token PX lease NX`; renewal and release use token-checked Lua scripts.
 * The adapter does not create, connect, or close the client.
 *
 * @param client - Connected Redis-compatible client.
 * @param options - Optional key prefix and token factory.
 * @returns A Redis-backed lock provider.
 */
export function createRedisLockProvider(
	client: RedisLockClient,
	options: RedisLockProviderOptions = {},
): LockProvider {
	const keyPrefix = options.keyPrefix ?? 'extension-utils:lock:'
	const tokenFactory = options.tokenFactory ?? generateUUID
	/** Maps a logical lock name to its Redis key.
	 * @param name - Logical lock name.
	 * @returns Redis key.
	 */
	const keyFor = (name: string) => `${keyPrefix}${encodeURIComponent(name)}`

	return {
		tryAcquire: async (name, acquireOptions = {}) => {
			// SET NX publishes ownership atomically; all later operations verify the token.
			const normalizedName = validateName(name)
			const leaseMs = validateLeaseMs(acquireOptions.leaseMs)
			const token = tokenFactory()
			const key = keyFor(normalizedName)
			const result = await client.set(key, token, 'PX', leaseMs, 'NX')
			if (result !== 'OK' && result !== true && result !== 1) return null

			let released = false
			return {
				name: normalizedName,
				token,
				renew: async () => {
					if (released) return false
					const renewed = await client.eval(RENEW_SCRIPT, 1, key, token, leaseMs)
					return redisResultSucceeded(renewed)
				},
				release: async () => {
					if (released) return false
					const releasedResult = await client.eval(RELEASE_SCRIPT, 1, key, token)
					released = true
					return redisResultSucceeded(releasedResult)
				},
			}
		},
	}
}
