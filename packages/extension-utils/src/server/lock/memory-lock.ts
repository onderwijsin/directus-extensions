import type { LockLease, LockProvider } from './lock-core'

import { isFunction } from '../../shared/guards'
import { createLockToken, validateLeaseMs, validateLockName } from './lock-core'

/** Options for deterministic in-memory lock providers. */
export interface MemoryLockProviderOptions {
	/** Default lease lifetime when an acquire call omits `leaseMs`. */
	defaultLeaseMs?: number
	/** Injectable clock returning milliseconds since epoch. */
	now?: () => number
	/** Injectable owner-token factory. */
	tokenFactory?: () => string
}

interface MemoryLockRecord {
	token: string
	expiresAt: number
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
	if (options.now !== undefined && !isFunction(options.now)) {
		throw new TypeError('Lock now must be a function')
	}
	if (options.tokenFactory !== undefined && !isFunction(options.tokenFactory)) {
		throw new TypeError('Lock tokenFactory must be a function')
	}
	if (options.defaultLeaseMs !== undefined) validateLeaseMs(options.defaultLeaseMs)

	const locks = new Map<string, MemoryLockRecord>()
	const now = options.now ?? Date.now
	const tokenFactory = options.tokenFactory ?? createLockToken

	return {
		tryAcquire: async (name, acquireOptions = {}) => {
			const normalizedName = validateLockName(name)
			const leaseMs = validateLeaseMs(acquireOptions.leaseMs ?? options.defaultLeaseMs)
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
