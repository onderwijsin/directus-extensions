import type { LockAcquireOptions, LockLease, LockProvider } from '../shared/lock'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { generateUUID } from '../shared/uuid'

/** Options for the explicit local-filesystem lock provider. */
export interface FileLockProviderOptions {
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

const ownerRecordFile = 'owner.json'

/** Returns whether an unknown failure is a Node filesystem error with the given code.
 * @param error - Unknown failure.
 * @param code - Expected Node error code.
 * @returns Whether the code matches.
 */
const isNodeError = (error: unknown, code: string): boolean =>
	typeof error === 'object' && error !== null && 'code' in error && error.code === code

/** Reads an owner record, treating a missing owner directory as an orphan.
 * @param path - Owner directory path.
 * @returns The owner record or `null`.
 */
const readOwnerRecord = async (path: string): Promise<OwnerRecord | null> => {
	try {
		const content = await readFile(join(path, ownerRecordFile), 'utf8')
		const parsed: unknown = JSON.parse(content)
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('token' in parsed) ||
			typeof parsed.token !== 'string' ||
			!('expiresAt' in parsed) ||
			typeof parsed.expiresAt !== 'number' ||
			!Number.isFinite(parsed.expiresAt)
		) {
			throw new Error(`Invalid lock owner record: ${path}`)
		}
		return { token: parsed.token, expiresAt: parsed.expiresAt }
	} catch (error) {
		if (isNodeError(error, 'ENOENT')) return null
		throw error
	}
}

/** Atomically replaces the owner record within an owner-specific directory.
 * @param path - Owner directory path.
 * @param record - Owner record to write.
 * @returns A promise that resolves after the rename.
 */
const writeOwnerRecord = async (path: string, record: OwnerRecord): Promise<void> => {
	const temporaryPath = join(path, `${ownerRecordFile}.${record.token}.tmp`)
	await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', flag: 'wx' })
	await rename(temporaryPath, join(path, ownerRecordFile))
}

/** Encodes one logical name component for use as a filesystem filename.
 * @param value - Name component.
 * @returns Encoded filename component.
 */
const encodedComponent = (value: string): string => encodeURIComponent(value)

/**
 * Creates a filesystem lock provider for processes sharing an explicit directory.
 *
 * Acquisition uses an atomic lock-file create. Ownership is stored in a token-specific directory;
 * releasing an old lease therefore cannot remove a replacement generation. Filesystem locks only
 * coordinate processes that can access the same directory and must not be treated as cluster-wide
 * locks when replicas do not share that filesystem.
 *
 * @param options - Shared directory and optional deterministic dependencies.
 * @returns A local-filesystem lock provider.
 */
export function createFileLockProvider(options: FileLockProviderOptions): LockProvider {
	if (options.directory.trim().length === 0) {
		throw new TypeError('Lock directory must not be empty')
	}
	const now = options.now ?? Date.now
	const tokenFactory = options.tokenFactory ?? generateUUID

	return {
		tryAcquire: async (name, acquireOptions: LockAcquireOptions = {}) => {
			const normalizedName = name.trim()
			if (normalizedName.length === 0) throw new TypeError('Lock name must not be empty')
			const leaseMs = acquireOptions.leaseMs ?? 30_000
			if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
				throw new RangeError('Lock leaseMs must be a finite positive number')
			}

			await mkdir(options.directory, { recursive: true })
			const lockPath = join(options.directory, `${encodedComponent(normalizedName)}.lock`)

			for (let attempt = 0; attempt < 3; attempt += 1) {
				// Publish owner metadata before the lock claim so stale recovery can inspect it.
				const token = tokenFactory()
				const ownerPath = join(
					options.directory,
					`${encodedComponent(normalizedName)}.${encodedComponent(token)}.owner`,
				)
				const owner = { token, expiresAt: now() + leaseMs }
				await mkdir(ownerPath)
				try {
					await writeOwnerRecord(ownerPath, owner)
					await writeFile(lockPath, token, { encoding: 'utf8', flag: 'wx' })
				} catch (error) {
					await rm(ownerPath, { force: true, recursive: true })
					if (!isNodeError(error, 'EEXIST')) throw error

					// Active owners win. Expired or orphaned claims are moved aside atomically
					// before their metadata is removed, so contenders never edit a live claim.
					let currentToken: string
					try {
						currentToken = (await readFile(lockPath, 'utf8')).trim()
					} catch (readError) {
						if (isNodeError(readError, 'ENOENT')) continue
						throw readError
					}
					const currentOwnerPath = join(
						options.directory,
						`${encodedComponent(normalizedName)}.${encodedComponent(currentToken)}.owner`,
					)
					const currentOwner = await readOwnerRecord(currentOwnerPath)
					if (currentOwner && currentOwner.expiresAt > now()) return null

					const stalePath = join(
						options.directory,
						`${encodedComponent(normalizedName)}.stale-${encodedComponent(token)}`,
					)
					try {
						await rename(lockPath, stalePath)
					} catch (renameError) {
						if (isNodeError(renameError, 'ENOENT')) continue
						throw renameError
					}
					await rm(stalePath, { force: true, recursive: true })
					await rm(currentOwnerPath, { force: true, recursive: true })
					continue
				}

				let released = false
				const lease: LockLease = {
					name: normalizedName,
					token,
					renew: async () => {
						// Both the owner record and claim must still identify this token.
						if (released) return false
						const currentOwner = await readOwnerRecord(ownerPath)
						if (
							!currentOwner ||
							currentOwner.token !== token ||
							currentOwner.expiresAt <= now()
						)
							return false
						let currentToken: string
						try {
							currentToken = (await readFile(lockPath, 'utf8')).trim()
						} catch (error) {
							if (isNodeError(error, 'ENOENT')) return false
							throw error
						}
						if (currentToken !== token) return false
						await writeOwnerRecord(ownerPath, {
							token,
							expiresAt: now() + leaseMs,
						})
						return true
					},
					release: async () => {
						// Release is owner-bound and idempotent; a replacement is never removed.
						if (released) return false
						released = true
						const currentOwner = await readOwnerRecord(ownerPath)
						if (
							!currentOwner ||
							currentOwner.token !== token ||
							currentOwner.expiresAt <= now()
						) {
							if (currentOwner?.token === token) {
								await rm(ownerPath, { force: true, recursive: true })
							}
							return false
						}
						let currentToken: string
						try {
							currentToken = (await readFile(lockPath, 'utf8')).trim()
						} catch (error) {
							if (isNodeError(error, 'ENOENT')) return false
							throw error
						}
						if (currentToken !== token) return false
						await rm(lockPath, { force: true })
						await rm(ownerPath, { force: true, recursive: true })
						return true
					},
				}
				return lease
			}

			return null
		},
	}
}
