/** Options controlling cache entry freshness. */
export interface CacheSetOptions {
	/** Maximum age of the entry in milliseconds. `0` expires immediately. */
	ttlMs?: number
}

/** Backend-independent asynchronous cache contract. */
export interface CacheStore {
	/** Returns a cached value or `undefined` when the key is absent or expired. */
	get<T>(key: string): Promise<T | undefined>
	/** Stores a value, optionally with a maximum age. */
	set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
	/** Removes a key and reports whether an unexpired entry was removed. */
	delete(key: string): Promise<boolean>
	/** Removes every entry owned by the store when the backend supports it. */
	clear?(): Promise<void>
}

/** Cache view that prefixes every key with a stable namespace. */
export interface CacheNamespace {
	get<T>(key: string): Promise<T | undefined>
	set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>
	delete(key: string): Promise<boolean>
}

/** Clock and entry used by the in-memory implementation. */
export interface MemoryCacheOptions {
	/** Injectable clock for deterministic expiry tests and specialized runtimes. */
	now?: () => number
}

interface MemoryEntry {
	value: unknown
	expiresAt: number | undefined
}

/** Validates and returns the optional cache entry lifetime.
 * @param options - Cache write options.
 * @returns The validated lifetime, when provided.
 */
const validateTtl = (options: CacheSetOptions | undefined): number | undefined => {
	const ttlMs = options?.ttlMs
	if (ttlMs === undefined) return undefined
	if (!Number.isFinite(ttlMs) || ttlMs < 0) {
		throw new RangeError('Cache ttlMs must be a finite non-negative number')
	}
	return ttlMs
}

/** Returns whether a cache entry has reached its expiration time.
 * @param entry - Cache entry to inspect.
 * @param now - Current timestamp.
 * @returns Whether the entry is expired.
 */
const isExpired = (entry: MemoryEntry, now: number): boolean =>
	entry.expiresAt !== undefined && entry.expiresAt <= now

/**
 * Creates a process-local cache backed by a closure over a `Map`.
 *
 * Values are not shared between processes or Directus replicas. The cache is an optimization and
 * entries may disappear when the process exits.
 *
 * @param options - Optional clock configuration.
 * @returns A process-local cache store.
 */
export function createMemoryCache(options: MemoryCacheOptions = {}): CacheStore {
	const entries = new Map<string, MemoryEntry>()
	const now = options.now ?? Date.now

	return {
		get<T>(key: string): Promise<T | undefined> {
			return Promise.resolve().then(() => {
				const entry = entries.get(key)
				if (!entry) return undefined
				if (isExpired(entry, now())) {
					entries.delete(key)
					return undefined
				}
				return entry.value as T
			})
		},
		set<T>(key: string, value: T, setOptions?: CacheSetOptions): Promise<void> {
			return Promise.resolve().then(() => {
				const ttlMs = validateTtl(setOptions)
				entries.set(key, {
					value,
					expiresAt: ttlMs === undefined ? undefined : now() + ttlMs,
				})
			})
		},
		delete(key: string): Promise<boolean> {
			return Promise.resolve().then(() => {
				const entry = entries.get(key)
				if (!entry) return false
				if (isExpired(entry, now())) {
					entries.delete(key)
					return false
				}
				return entries.delete(key)
			})
		},
		clear(): Promise<void> {
			entries.clear()
			return Promise.resolve()
		},
	}
}

/**
 * Creates a namespaced view over any cache store.
 *
 * @param store - Backend that owns the entries.
 * @param namespace - Stable prefix used for every key in this view.
 * @returns A namespaced cache facade.
 */
export function createNamespacedCache(store: CacheStore, namespace: string): CacheNamespace {
	const prefix = `${namespace}:`
	/** Maps a namespace-local key to the underlying store key.
	 * @param key - Namespace-local key.
	 * @returns The namespaced key.
	 */
	const keyFor = (key: string) => `${prefix}${key}`

	return {
		get: <T>(key: string) => store.get<T>(keyFor(key)),
		set: <T>(key: string, value: T, options?: CacheSetOptions) =>
			store.set(keyFor(key), value, options),
		delete: (key: string) => store.delete(keyFor(key)),
	}
}

/** Minimal Redis-compatible client required by the Redis adapter. */
export interface RedisCacheClient {
	get(key: string): Promise<string | null>
	set(key: string, value: string, ...arguments_: unknown[]): Promise<unknown>
	del(key: string): Promise<number>
}

/** Serialization boundary for values stored in Redis. */
export interface CacheCodec {
	serialize(value: unknown): string
	deserialize<T>(value: string): T
}

/** Options for the injected Redis-compatible cache adapter. */
export interface RedisCacheOptions {
	codec?: CacheCodec
}

const jsonCodec: CacheCodec = {
	serialize: (value: unknown) => {
		const serialized = JSON.stringify(value)
		if (serialized === undefined) throw new TypeError('Cache value must be JSON serializable')
		return serialized
	},
	deserialize: <T>(value: string) => JSON.parse(value) as T,
}

/**
 * Creates a cache store backed by an injected Redis-compatible client.
 *
 * The adapter does not create, connect, or close the client. TTLs use the Redis `SET key value PX`
 * command form. Client and serialization errors are propagated to the caller.
 *
 * @param client - Connected Redis-compatible client.
 * @param options - Optional value codec.
 * @returns A Redis-backed cache store.
 */
export function createRedisCache(
	client: RedisCacheClient,
	options: RedisCacheOptions = {},
): CacheStore {
	const codec = options.codec ?? jsonCodec

	return {
		async get<T>(key: string): Promise<T | undefined> {
			const value = await client.get(key)
			return value === null ? undefined : codec.deserialize<T>(value)
		},
		async set<T>(key: string, value: T, setOptions?: CacheSetOptions): Promise<void> {
			const ttlMs = validateTtl(setOptions)
			const serialized = codec.serialize(value)
			if (ttlMs === undefined) {
				await client.set(key, serialized)
				return
			}
			await client.set(key, serialized, 'PX', ttlMs)
		},
		async delete(key: string): Promise<boolean> {
			return (await client.del(key)) > 0
		},
	}
}
