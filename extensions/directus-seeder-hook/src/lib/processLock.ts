import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Standard lock name for bulk operations (seeding, extraction, snapshots, etc.).
 * Use this constant to ensure consistent lock naming across extensions.
 */
export const BULK_OPERATION_LOCK = 'bulk-operation'

interface ProcessLockOptions {
	/** Unique identifier for the lock. Defaults to BULK_OPERATION_LOCK for standard bulk operations. */
	lockName?: string
	/** Max age of lock file in milliseconds before it's considered stale (default: 5 minutes) */
	maxLockAge?: number
}

/** Signals contention with an existing legacy bulk-operation flag. */
export class ProcessLockAlreadyExistsError extends Error {
	public readonly lockName: string

	/**
	 * Creates a contention error for the named process flag.
	 * @param lockName - Logical legacy lock name.
	 */
	public constructor(lockName: string) {
		super(`Process lock already exists: ${lockName}`)
		this.name = 'ProcessLockAlreadyExistsError'
		this.lockName = lockName
	}
}

/**
 * Narrows a Node filesystem failure for contention detection.
 * @param error - The caught filesystem failure.
 * @returns Whether the failure exposes a Node error code.
 */
const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => {
	return error instanceof Error && 'code' in error
}

/**
 * Acquires a process lock by creating a flag file in the system temp directory.
 * This allows cross-process communication - useful for signaling that a long-running
 * operation is in progress.
 *
 * @param options - Lock configuration (defaults to bulk-operation lock if not specified)
 * @returns The path to the created lock file
 *
 * @example
 * ```typescript
 * // In a seeding command (uses default bulk-operation lock):
 * acquireLock()
 * try {
 *   await performSeeding()
 * } finally {
 *   releaseLock()
 * }
 *
 * // Or with custom lock name:
 * acquireLock({ lockName: 'custom-operation' })
 * ```
 */
export const acquireLock = (options: ProcessLockOptions = {}): string => {
	const { lockName = BULK_OPERATION_LOCK } = options
	const lockPath = getLockPath(lockName)

	cleanStaleLock(options)

	try {
		writeFileSync(lockPath, String(Date.now()), { flag: 'wx' })
	} catch (error) {
		if (isErrnoException(error) && error.code === 'EEXIST') {
			throw new ProcessLockAlreadyExistsError(lockName)
		}

		throw error
	}

	return lockPath
}

/**
 * Releases a process lock by removing the flag file.
 *
 * @param options - Lock configuration (defaults to bulk-operation lock if not specified)
 * @returns true if the lock was released, false if it didn't exist
 */
export const releaseLock = (options: ProcessLockOptions = {}): boolean => {
	const { lockName = BULK_OPERATION_LOCK } = options
	const lockPath = getLockPath(lockName)

	if (existsSync(lockPath)) {
		rmSync(lockPath, { recursive: true, force: true })
		return true
	}

	return false
}

/**
 * Checks if a process lock is currently active.
 * Automatically cleans up stale locks that are older than maxLockAge.
 *
 * @param options - Lock configuration (defaults to bulk-operation lock if not specified)
 * @returns true if the lock is active, false otherwise
 *
 * @example
 * ```typescript
 * // In a hook that should skip during bulk operations (uses default):
 * if (isLocked()) {
 *   logger.debug('Bulk operation in progress; skipping')
 *   return
 * }
 *
 * // Or check custom lock:
 * if (isLocked({ lockName: 'custom-operation' })) {
 *   return
 * }
 * ```
 */
export const isLocked = (options: ProcessLockOptions = {}): boolean => {
	const { lockName = BULK_OPERATION_LOCK, maxLockAge = 5 * 60 * 1000 } = options
	const lockPath = getLockPath(lockName)

	if (!existsSync(lockPath)) {
		return false
	}

	// Check if lock is stale
	const lockAge = Date.now() - statSync(lockPath).mtimeMs
	if (lockAge > maxLockAge) {
		// Lock is stale, clean it up
		rmSync(lockPath, { recursive: true, force: true })
		return false
	}

	return true
}

/**
 * Removes a stale lock file if it exists and is older than maxLockAge.
 *
 * @param options - Lock configuration (defaults to bulk-operation lock if not specified)
 * @returns true if a stale lock was cleaned up, false otherwise
 */
export const cleanStaleLock = (options: ProcessLockOptions = {}): boolean => {
	const { lockName = BULK_OPERATION_LOCK, maxLockAge = 5 * 60 * 1000 } = options
	const lockPath = getLockPath(lockName)

	if (!existsSync(lockPath)) {
		return false
	}

	const lockAge = Date.now() - statSync(lockPath).mtimeMs
	if (lockAge > maxLockAge) {
		rmSync(lockPath, { recursive: true, force: true })
		return true
	}

	return false
}

/**
 * Gets the file system path for a lock file.
 *
 * @param lockName - Unique identifier for the lock
 * @returns Absolute path to the lock file
 */
const getLockPath = (lockName: string): string => {
	return join(tmpdir(), `directus-lock-${lockName}.flag`)
}
