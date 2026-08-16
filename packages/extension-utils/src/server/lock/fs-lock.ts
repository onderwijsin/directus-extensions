import type { LockAcquireOptions, LockLease, LockProvider } from './lock-core'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { attempt } from '../../shared/attempt'
import { isFiniteNumber, isFunction, isRecord, hasKey, isString } from '../../shared/guards'
import { createLockToken, isNodeError, validateLeaseMs, validateLockName } from './lock-core'

/** Options for the explicit local-filesystem lock provider. */
export interface FsLockProviderOptions {
	/** Directory shared by the processes that should coordinate. */
	directory: string
	/** Injectable clock returning milliseconds since epoch. */
	now?: () => number
	/** Injectable owner-token factory. */
	tokenFactory?: () => string
}

interface OwnerRecord {
	token: string
	expiresAt: number
}

interface FsLockDependencies {
	directory: string
	now: () => number
	tokenFactory: () => string
}

const ownerRecordFile = 'owner.json'

/**
 * Re-throws an attempted filesystem failure as an Error.
 * @param error - Failure captured by `attempt`.
 * @returns Never returns.
 */
const raiseFsError = (error: unknown): never => {
	if (error instanceof Error) throw error
	throw new Error(String(error))
}

/**
 * Reads an owner record, treating a missing owner directory as an orphan.
 * @param path - Owner directory path.
 * @returns The owner record or `null`.
 */
const readOwnerRecord = async (path: string): Promise<OwnerRecord | null> => {
	const result = await attempt(async () => {
		const content = await readFile(join(path, ownerRecordFile), 'utf8')
		const parsed: unknown = JSON.parse(content)
		if (
			!isRecord(parsed) ||
			!hasKey(parsed, 'token') ||
			!isString(parsed.token) ||
			!hasKey(parsed, 'expiresAt') ||
			!isFiniteNumber(parsed.expiresAt)
		) {
			throw new Error(`Invalid lock owner record: ${path}`)
		}
		return { token: parsed.token, expiresAt: parsed.expiresAt }
	})

	if (result.error === null) return result.data
	if (isNodeError(result.error, 'ENOENT')) return null
	return raiseFsError(result.error)
}

/**
 * Atomically replaces the owner record within an owner-specific directory.
 * @param path - Owner directory path.
 * @param record - Owner record to write.
 * @returns A promise that resolves after the record is written.
 */
const writeOwnerRecord = async (path: string, record: OwnerRecord): Promise<void> => {
	const temporaryPath = join(path, `${ownerRecordFile}.${record.token}.tmp`)
	await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', flag: 'wx' })
	await rename(temporaryPath, join(path, ownerRecordFile))
}

/**
 * Encodes one logical name component for use as a filesystem filename.
 * @param value - Name component.
 * @returns Encoded filename component.
 */
const encodedComponent = (value: string): string => encodeURIComponent(value)

/**
 * Reads the current claim token, treating a missing claim as a retryable race.
 * @param path - Lock claim path.
 * @returns The claim token or `null` when the claim disappeared.
 */
const readClaimToken = async (path: string): Promise<string | null> => {
	const result = await attempt(() => readFile(path, 'utf8'))
	if (result.error === null) return result.data === null ? null : result.data.trim()
	if (isNodeError(result.error, 'ENOENT')) return null
	return raiseFsError(result.error)
}

/**
 * Removes a stale filesystem claim when the rename wins the race.
 * @param lockPath - Current lock claim path.
 * @param stalePath - Temporary stale claim path.
 * @param ownerPath - Current owner metadata path.
 * @returns Whether the stale claim was moved and removed.
 */
const removeStaleClaim = async (
	lockPath: string,
	stalePath: string,
	ownerPath: string,
): Promise<boolean> => {
	const result = await attempt(() => rename(lockPath, stalePath))
	if (result.error !== null) {
		if (isNodeError(result.error, 'ENOENT')) return false
		return raiseFsError(result.error)
	}
	await rm(stalePath, { force: true, recursive: true })
	await rm(ownerPath, { force: true, recursive: true })
	return true
}

/**
 * Creates a filesystem lease whose mutations remain bound to its owner token.
 * @param name - Normalized lock name.
 * @param token - Owner token.
 * @param leaseMs - Lease duration.
 * @param ownerPath - Owner metadata path.
 * @param lockPath - Lock claim path.
 * @param now - Clock provider.
 * @returns An owner-bound lock lease.
 */
const createFsLease = (
	name: string,
	token: string,
	leaseMs: number,
	ownerPath: string,
	lockPath: string,
	now: () => number,
): LockLease => {
	let released = false

	const ownsClaim = async (): Promise<boolean> => {
		const owner = await readOwnerRecord(ownerPath)
		if (!owner || owner.token !== token || owner.expiresAt <= now()) return false
		return (await readClaimToken(lockPath)) === token
	}

	return {
		name,
		token,
		renew: async () => {
			// Both the owner record and claim must still identify this token.
			if (released || !(await ownsClaim())) return false
			await writeOwnerRecord(ownerPath, { token, expiresAt: now() + leaseMs })
			return true
		},
		release: async () => {
			// Release is owner-bound and idempotent; a replacement is never removed.
			if (released) return false
			released = true
			const owner = await readOwnerRecord(ownerPath)
			if (!owner || owner.token !== token) return false
			if (owner.expiresAt <= now()) {
				await rm(ownerPath, { force: true, recursive: true })
				return false
			}
			if ((await readClaimToken(lockPath)) !== token) return false
			await rm(lockPath, { force: true })
			await rm(ownerPath, { force: true, recursive: true })
			return true
		},
	}
}

/**
 * Acquires one filesystem lock, recovering expired or orphaned claims.
 * @param dependencies - Filesystem provider dependencies.
 * @param name - Lock name.
 * @param acquireOptions - Lock acquisition options.
 * @returns An owner-bound lock lease or `null` on contention.
 */
const acquireFsLock = async (
	dependencies: FsLockDependencies,
	name: string,
	acquireOptions: LockAcquireOptions,
): Promise<LockLease | null> => {
	const { directory, now, tokenFactory } = dependencies
	const normalizedName = validateLockName(name)
	const leaseMs = validateLeaseMs(acquireOptions.leaseMs)
	await mkdir(directory, { recursive: true })
	const lockPath = join(directory, `${encodedComponent(normalizedName)}.lock`)

	for (let attemptNumber = 0; attemptNumber < 3; attemptNumber += 1) {
		// Publish owner metadata before the lock claim so stale recovery can inspect it.
		const token = tokenFactory()
		const ownerPath = join(
			directory,
			`${encodedComponent(normalizedName)}.${encodedComponent(token)}.owner`,
		)
		const owner = { token, expiresAt: now() + leaseMs }
		const ownerDirectoryResult = await attempt(() => mkdir(ownerPath))
		if (ownerDirectoryResult.error !== null) {
			return raiseFsError(ownerDirectoryResult.error)
		}

		const claimResult = await attempt(async () => {
			await writeOwnerRecord(ownerPath, owner)
			await writeFile(lockPath, token, { encoding: 'utf8', flag: 'wx' })
		})
		if (claimResult.error === null) {
			return createFsLease(normalizedName, token, leaseMs, ownerPath, lockPath, now)
		}

		await rm(ownerPath, { force: true, recursive: true })
		if (!isNodeError(claimResult.error, 'EEXIST')) return raiseFsError(claimResult.error)

		// Active owners win. Expired or orphaned claims are moved aside atomically before their
		// metadata is removed, so contenders never edit a live claim.
		const currentToken = await readClaimToken(lockPath)
		if (currentToken === null) continue
		const currentOwnerPath = join(
			directory,
			`${encodedComponent(normalizedName)}.${encodedComponent(currentToken)}.owner`,
		)
		const currentOwner = await readOwnerRecord(currentOwnerPath)
		if (currentOwner && currentOwner.expiresAt > now()) return null

		const stalePath = join(
			directory,
			`${encodedComponent(normalizedName)}.stale-${encodedComponent(token)}`,
		)
		if (await removeStaleClaim(lockPath, stalePath, currentOwnerPath)) continue
	}

	return null
}

/**
 * Creates a filesystem lock provider for processes sharing an explicit directory.
 *
 * Filesystem locks only coordinate processes that can access the same directory and must not be
 * treated as cluster-wide locks when replicas do not share that filesystem.
 *
 * @param options - Shared directory and optional deterministic dependencies.
 * @returns A local-filesystem lock provider.
 */
export function createFsLockProvider(options: FsLockProviderOptions): LockProvider {
	if (!isString(options.directory) || options.directory.trim().length === 0) {
		throw new TypeError('Lock directory must not be empty')
	}
	if (options.now !== undefined && !isFunction(options.now)) {
		throw new TypeError('Lock now must be a function')
	}
	if (options.tokenFactory !== undefined && !isFunction(options.tokenFactory)) {
		throw new TypeError('Lock tokenFactory must be a function')
	}

	const dependencies: FsLockDependencies = {
		directory: options.directory,
		now: options.now ?? Date.now,
		tokenFactory: options.tokenFactory ?? createLockToken,
	}

	return {
		tryAcquire: (name, acquireOptions = {}) =>
			acquireFsLock(dependencies, name, acquireOptions),
	}
}
