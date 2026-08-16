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
