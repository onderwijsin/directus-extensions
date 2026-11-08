import type { Logger } from 'pino'

import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createLogger } from '@onderwijsin/directus-extension-utils/server'

import { acquireLock, isLocked, ProcessLockAlreadyExistsError } from './processLock'

interface AutoTaskOptions {
	/** Unique identifier for the debounce lock (e.g., "schema-snapshot" or "seed-extraction") */
	debounceId: string
	/** Called when debounce period ends and task should execute */
	task: () => Promise<void> | void
	/** Discards pending work when another bulk operation suppresses this task. */
	onSkip?: () => void
	/** Called to log messages */
	logger?: Logger
	/** Milliseconds to wait after the most recent event before running task */
	debounceTime?: number
	/** Max age of lock file before it's considered stale */
	maxLockAge?: number
}

/**
 * Creates a debounced and lock-protected task handler for automatic operations.
 * Useful for tasks like auto-snapshotting or auto-extracting seeds in response to events.
 * @param options - Configuration options for the auto task handler.
 * @returns A function that can be called to trigger the task with debouncing and locking.
 */
export const createAutoTaskHandler = (options: AutoTaskOptions) => {
	const {
		debounceId,
		task,
		onSkip,
		logger: loggerInstance,
		debounceTime = 15_000,
		maxLockAge = 5 * 60 * 1000,
	} = options

	const logger = createLogger(loggerInstance)

	const debounceLockPath = join(tmpdir(), `directus-debounce-${debounceId}.lock`)
	let timer: NodeJS.Timeout | null = null
	let running = false

	/**
	 * Reads the marker while tolerating cleanup by another process.
	 * @returns Event token, or undefined when no work remains.
	 */
	const readMarker = (): string | undefined => {
		try {
			return readFileSync(debounceLockPath, 'utf8')
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
			throw error
		}
	}

	/**
	 * Runs the pending task, preserving the original skip-on-contention semantics.
	 * @returns Resolves after execution or cleanup.
	 */
	const run = async () => {
		// A later event may finish its debounce while this task still holds the lock.
		// Its marker remains pending and is scheduled again by the running task.
		if (running) return
		const debounceLockStats = statSync(debounceLockPath, { throwIfNoEntry: false })
		if (!debounceLockStats) return

		const elapsedDebounceTime = Date.now() - debounceLockStats.mtimeMs
		const remainingDebounceTime = debounceTime - elapsedDebounceTime

		if (remainingDebounceTime > 0) {
			logger.trace?.(
				`🪝 ${debounceId}: debounce extended by another process → waiting ${remainingDebounceTime}ms`,
			)
			timer = setTimeout(() => void run(), remainingDebounceTime)
			return
		}

		const marker = readMarker()
		if (marker === undefined) return
		let lock: ReturnType<typeof acquireLock> | undefined

		try {
			// Check if bulk operation is in progress → skip
			if (isLocked({ maxLockAge })) {
				logger.info(`🪝 Bulk operation active, skipping ${debounceId}`)
				onSkip?.()
				return
			}

			// Acquire bulk-operation lock before running
			try {
				lock = acquireLock({ maxLockAge })
			} catch (error) {
				if (error instanceof ProcessLockAlreadyExistsError) {
					logger.info(`🪝 Bulk operation became active, skipping ${debounceId}`)
					onSkip?.()
					return
				}

				throw error
			}

			running = true
			logger.info(`🪝 Running auto task: ${debounceId}`)
			await task()
			logger.info(`🪝 Completed auto task: ${debounceId}`)
		} catch (error) {
			const msg = error instanceof Error ? error.message : 'Unknown error'
			logger.error(`🪝 Error in auto task [${debounceId}]: ${msg}`)
		} finally {
			// Only release a lock acquired by this task
			lock?.release()

			running = false
			// Never erase an event that arrived while extraction was awaiting I/O.
			const nextMarker = readMarker()
			if (nextMarker !== undefined) {
				if (nextMarker === marker) {
					rmSync(debounceLockPath, { force: true })
				} else {
					if (timer) clearTimeout(timer)
					timer = setTimeout(() => void run(), 0)
				}
			}
		}
	}

	return () => {
		const debounceLockStats = statSync(debounceLockPath, { throwIfNoEntry: false })

		if (debounceLockStats) {
			const age = Date.now() - debounceLockStats.mtimeMs
			if (age > maxLockAge) {
				logger.warn(`🪝 ${debounceId}: resetting stale debounce lock`)
			} else {
				logger.trace?.(`🪝 ${debounceId}: event within debounce window → extending delay`)
			}
		}

		// Create or update the debounce lock file and (re)start the timer
		writeFileSync(debounceLockPath, randomUUID())
		logger.info(`🪝 ${debounceId}: debounce lock updated`)
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => void run(), debounceTime)
		logger.info(`🪝 ${debounceId}: scheduled after ${debounceTime / 1000}s`)
	}
}
