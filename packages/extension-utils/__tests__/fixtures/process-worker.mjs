import { appendFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'

/** @typedef {{ release: () => Promise<boolean>; token?: string }} LockLease */
/** @typedef {{ tryAcquire: (name: string, options: { leaseMs?: number }) => Promise<LockLease | null> }} LockProvider */
/** @typedef {{ touch: (identifier: string, updatedAt: number) => Promise<object>; get: (identifier: string) => Promise<object | undefined> }} MarkerStore */
/** @typedef {{ dispose: () => Promise<void> }} Storage */
/** @typedef {(() => Promise<void>) & { dispose: () => void }} Handler */
/** @typedef {{ taskId: string; eventPath: string; debounceMs: number; markerLeaseMs: number; taskLeaseMs: number; renewalIntervalMs: number; durationMs: number; lockTimeoutMs: number }} HandlerConfig */
/** @typedef {{ taskId?: string; storage?: Storage; debounceMs?: number; markerLeaseMs?: number; taskLeaseMs?: number; renewalIntervalMs?: number; task: (signal: AbortSignal) => Promise<void>; onError: (error: unknown) => Promise<void> }} HandlerOptions */
/** @typedef {{ createFsLockProvider: (options: { directory: string }) => LockProvider; createFsMarkerStore: (options: { directory: string }) => MarkerStore; createFsTaskHandlerStorage: (options: object) => Storage; createAutoTaskHandler: (options: HandlerOptions) => Handler }} ExtensionUtils */
/** @typedef {{ op: string; name?: string; leaseMs?: number; identifier?: string; updatedAt?: number }} Command */

const distPath = process.argv[2] ?? ''
const mode = process.argv[3] ?? ''
const directory = process.argv[4] ?? ''
const configJson = process.argv[5]
const config = /** @type {Partial<HandlerConfig>} */ (configJson ? JSON.parse(configJson) : {})
const extensionUtils = /** @type {ExtensionUtils} */ (await import(pathToFileURL(distPath).href))
const respond = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
const noop = () => undefined
const lockProvider =
	mode === 'lock' ? extensionUtils.createFsLockProvider({ directory }) : undefined
const markerProvider =
	mode === 'marker' ? extensionUtils.createFsMarkerStore({ directory }) : undefined
/** @type {LockLease | null | undefined} */
let lease

/**
 * @param {number} durationMs - Duration to sleep.
 * @param {AbortSignal} signal - Signal that aborts the sleep.
 * @returns {Promise<void>} Resolves when the duration completes.
 */
const sleep = (durationMs, signal) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, durationMs)
		const abort = () => {
			clearTimeout(timer)
			const reason = signal.reason
			reject(reason instanceof Error ? reason : new Error('Task aborted'))
		}
		if (signal.aborted) abort()
		else signal.addEventListener('abort', abort, { once: true })
	})

const event = async (status) => {
	await appendFile(
		config.eventPath ?? '',
		`${JSON.stringify({ status, at: Date.now(), pid: process.pid })}\n`,
	)
}

const handler =
	mode === 'handler'
		? extensionUtils.createAutoTaskHandler({
				taskId: config.taskId,
				storage: extensionUtils.createFsTaskHandlerStorage({
					directory,
					lockTimeoutMs: config.lockTimeoutMs,
				}),
				debounceMs: config.debounceMs,
				markerLeaseMs: config.markerLeaseMs,
				taskLeaseMs: config.taskLeaseMs,
				renewalIntervalMs: config.renewalIntervalMs,
				logger: { info: noop, error: noop, warn: noop, trace: noop },
				task: async (signal) => {
					await event('started')
					await sleep(config.durationMs ?? 0, signal)
					await event('completed')
				},
				onError: async (error) => {
					await event('error')
					respond({
						ok: false,
						type: 'error',
						error: error instanceof Error ? error.message : String(error),
					})
				},
			})
		: undefined

/**
 * @param {string} line - JSON command line.
 * @returns {Promise<void>} Resolves after handling the command.
 */
const handleLine = async (line) => {
	try {
		const command = /** @type {Command} */ (JSON.parse(line))
		if (mode === 'lock' && command.op === 'acquire') {
			lease = await lockProvider?.tryAcquire(command.name ?? '', { leaseMs: command.leaseMs })
			respond({ ok: true, acquired: lease !== null, token: lease?.token ?? null })
			return
		}
		if (mode === 'lock' && command.op === 'release') {
			respond({ ok: true, released: await lease?.release() })
			return
		}
		if (mode === 'marker' && command.op === 'touch') {
			respond({
				ok: true,
				marker: await markerProvider?.touch(
					command.identifier ?? '',
					command.updatedAt ?? 0,
				),
			})
			return
		}
		if (mode === 'marker' && command.op === 'get') {
			respond({ ok: true, marker: await markerProvider?.get(command.identifier ?? '') })
			return
		}
		if (mode === 'handler' && command.op === 'trigger') {
			await handler?.()
			respond({ ok: true, type: 'triggered' })
			return
		}
		if (command.op === 'exit') {
			respond({ ok: true })
			process.exit(0)
		}
		throw new Error(`Unknown command: ${line}`)
	} catch (error) {
		respond({ ok: false, error: error instanceof Error ? error.message : String(error) })
	}
}

const input = createInterface({ input: process.stdin })
input.on('line', (line) => void handleLine(line))
