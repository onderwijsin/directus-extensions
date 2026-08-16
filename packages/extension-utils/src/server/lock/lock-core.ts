import { isFiniteNumber, isNonBlankString, isRecord, hasKey, isString } from '../../shared/guards'
import { uuid } from '../../shared/uuid'

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

/** Default lease lifetime for memory and filesystem providers. */
const DEFAULT_LOCK_LEASE_MS = 30_000

/**
 * Normalizes and validates a logical lock name.
 * @param name - Lock name to validate.
 * @returns The normalized lock name.
 */
export const validateLockName = (name: string): string => {
	const normalized = name.trim()
	if (!isNonBlankString(normalized)) throw new TypeError('Lock name must not be empty')
	return normalized
}

/**
 * Validates a positive lock lease duration.
 * @param leaseMs - Lease duration to validate.
 * @returns The validated lease duration.
 */
export const validateLeaseMs = (leaseMs: number | undefined): number => {
	const value = leaseMs ?? DEFAULT_LOCK_LEASE_MS
	if (!isFiniteNumber(value) || value <= 0) {
		throw new RangeError('Lock leaseMs must be a finite positive number')
	}
	return value
}

/**
 * Returns whether an unknown failure is a Node filesystem error with the given code.
 * @param error - Unknown failure to inspect.
 * @param code - Expected Node error code.
 * @returns Whether the error has the expected code.
 */
export const isNodeError = (error: unknown, code: string): boolean =>
	isRecord(error) && hasKey(error, 'code') && isString(error.code) && error.code === code

/**
 * Generates the default owner token for lock providers.
 * @returns A unique owner token.
 */
export const createLockToken = (): string => uuid()
