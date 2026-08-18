import type { LockLease, LockProvider, LockProviderOptions } from './lock-core'

import { isFunction, isNonBlankString } from '../../shared/guards'
import {
	createLockLease,
	createLockToken,
	resolveLeaseMs,
	validateLeaseMs,
	validateLockName,
} from './lock-core'

/** Options for deterministic in-memory lock providers. */
export interface MemoryLockProviderOptions extends LockProviderOptions {
	/** Identifier selecting the process-local lock namespace. */
	providerId?: string
	/** Injectable clock returning milliseconds since epoch. */
	now?: () => number
}

interface MemoryLockRecord {
	token: string
	expiresAt: number
}

interface MemoryLockConfig {
	defaultLeaseMs?: number
	now: () => number
	providerId: string
	tokenFactory: () => string
}

const DEFAULT_MEMORY_LOCK_PROVIDER_ID = 'default'
const memoryLockMaps = new Map<string, Map<string, MemoryLockRecord>>()

/**
 * Validates and normalizes memory lock configuration.
 * @param options - Memory provider options.
 * @returns Validated memory lock configuration.
 */
const validateMemoryLockConfig = (options: MemoryLockProviderOptions): MemoryLockConfig => {
	if (options.now !== undefined && !isFunction(options.now)) {
		throw new TypeError('Lock now must be a function')
	}
	if (options.tokenFactory !== undefined && !isFunction(options.tokenFactory)) {
		throw new TypeError('Lock tokenFactory must be a function')
	}
	const providerId = options.providerId?.trim() ?? DEFAULT_MEMORY_LOCK_PROVIDER_ID
	if (!isNonBlankString(providerId)) throw new TypeError('Lock providerId must not be blank')
	if (options.defaultLeaseMs !== undefined) validateLeaseMs(options.defaultLeaseMs)

	return {
		defaultLeaseMs: options.defaultLeaseMs,
		now: options.now ?? Date.now,
		providerId,
		tokenFactory: options.tokenFactory ?? createLockToken,
	}
}

/**
 * Creates an owner-bound lease over one process-local lock record.
 * @param name - Normalized lock name.
 * @param token - Owner token.
 * @param leaseMs - Lease duration.
 * @param now - Clock provider.
 * @param locks - Process-local lock records.
 * @returns An owner-bound lock lease.
 */
const createMemoryLease = (
	name: string,
	token: string,
	leaseMs: number,
	now: () => number,
	locks: Map<string, MemoryLockRecord>,
): LockLease =>
	createLockLease(name, token, {
		/**
		 * Renews the in-memory lease when its token is still current.
		 * @returns Whether renewal succeeded.
		 */
		renew: () => {
			const currentTime = now()
			const record = locks.get(name)
			if (!record || record.token !== token || record.expiresAt <= currentTime) {
				if (record?.token === token) locks.delete(name)
				return false
			}
			record.expiresAt = currentTime + leaseMs
			return true
		},
		/**
		 * Releases the in-memory lease when its token is still current.
		 * @returns Whether release succeeded.
		 */
		release: () => {
			const currentTime = now()
			const record = locks.get(name)
			if (!record || record.token !== token || record.expiresAt <= currentTime) {
				if (record?.token === token) locks.delete(name)
				return false
			}
			locks.delete(name)
			return true
		},
	})

/**
 * Creates a process-local lock provider.
 *
 * Providers with the same `providerId` share lock state within the current process. It is not safe
 * for multiple processes or Directus replicas.
 *
 * @param options - Optional clock and token configuration.
 * @returns A process-local lock provider.
 */
export function createMemoryLockProvider(options: MemoryLockProviderOptions = {}): LockProvider {
	const config = validateMemoryLockConfig(options)
	const locks = memoryLockMaps.get(config.providerId) ?? new Map<string, MemoryLockRecord>()
	memoryLockMaps.set(config.providerId, locks)

	return {
		/**
		 * Attempts to acquire a process-local lock.
		 * @param name - Logical lock name.
		 * @param acquireOptions - Optional lease configuration.
		 * @returns An owner-bound lease, or `null` on contention.
		 */
		tryAcquire: async (name, acquireOptions = {}) => {
			const normalizedName = validateLockName(name)
			const leaseMs = resolveLeaseMs(acquireOptions, config.defaultLeaseMs)
			const currentTime = config.now()
			const current = locks.get(normalizedName)
			if (current && current.expiresAt > currentTime) return Promise.resolve(null)
			if (current) locks.delete(normalizedName)

			const token = config.tokenFactory()
			locks.set(normalizedName, { token, expiresAt: currentTime + leaseMs })
			return createMemoryLease(normalizedName, token, leaseMs, config.now, locks)
		},
		/**
		 * Checks whether a memory lock is currently held.
		 * @param name - Logical lock name.
		 * @returns Whether the lock is currently held.
		 */
		isLocked: (name) => {
			const normalizedName = validateLockName(name)
			const current = locks.get(normalizedName)
			return Promise.resolve(current !== undefined && current.expiresAt > config.now())
		},
	}
}
