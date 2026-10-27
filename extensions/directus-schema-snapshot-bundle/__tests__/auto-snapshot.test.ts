import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Action = (event: string, handler: () => Promise<void> | void) => void
type HookRegister = (
	functions: { action: Action },
	context: { env: Record<string, unknown>; logger: typeof logger },
) => void

const mocks = vi.hoisted(() => {
	const register = vi.fn<HookRegister>()
	return {
		directory: '',
		register,
		createSnapshot: vi.fn<() => Promise<void>>(),
		storageOptions: vi.fn<(options: { directory: string }) => void>(),
		defineHook: vi.fn((callback: HookRegister) => register.mockImplementation(callback)),
	}
})

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({ defineHook: mocks.defineHook }))
vi.mock('../src/shared/createSnapshot', () => ({ createSnapshot: mocks.createSnapshot }))
vi.mock('@onderwijsin/directus-extension-utils/server', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('@onderwijsin/directus-extension-utils/server')>()
	return {
		...actual,
		/**
		 * Retains the actual task behavior while avoiding unrelated filesystem-provider coordination.
		 * @param options - Filesystem directory configured by the hook.
		 * @returns Process-local task storage for deterministic scheduling.
		 */
		createFsTaskHandlerStorage: (options: { directory: string }) => {
			mocks.storageOptions(options)
			return actual.createMemoryTaskHandlerStorage()
		},
	}
})
vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return { ...actual, default: { ...actual, tmpdir: () => mocks.directory } }
})

import '../src/auto-snapshot-hook'

const logger = pino({ level: 'silent' })
let directory = ''
let stop: (() => Promise<void> | void) | undefined

/**
 * Captures registrations while retaining the real auto-task scheduler and marker/lock behavior.
 * @param env - Directus environment supplied to the hook.
 * @returns Captured action registrations and their context.
 */
function registerHook(
	env: Record<string, unknown> = { SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: true },
) {
	const action = vi.fn<Action>()
	const context = { env: { SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: directory, ...env }, logger }
	mocks.register({ action }, context)
	stop = action.mock.calls.find(([event]) => event === 'server.stop')?.[1]
	return { action, context }
}

/**
 * Gets one registered schema-event callback.
 * @param action - Captured action registration function.
 * @param event - Lifecycle event to find.
 * @returns The registered callback.
 */
function handlerFor(action: ReturnType<typeof vi.fn<Action>>, event: string) {
	const handler = action.mock.calls.find(([registeredEvent]) => registeredEvent === event)?.[1]
	if (!handler) throw new Error(`No handler registered for ${event}`)
	return handler
}

describe('automatic schema snapshots', () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		directory = await mkdtemp(path.join(tmpdir(), 'schema-split-auto-'))
		mocks.directory = directory
		mocks.createSnapshot.mockResolvedValue(undefined)
		stop = undefined
		vi.useFakeTimers()
	})

	afterEach(async () => {
		await stop?.()
		vi.useRealTimers()
		await rm(directory, { recursive: true, force: true })
	})

	it('registers no automatic work by default or when the bundle is disabled', () => {
		expect(registerHook({}).action).not.toHaveBeenCalled()
		expect(
			registerHook({
				SCHEMA_SNAPSHOT_ENABLED: false,
				SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: true,
			}).action,
		).not.toHaveBeenCalled()
	})

	it('registers nine schema mutation events and debounces a burst for 15 seconds', async () => {
		const { action, context } = registerHook()
		expect(mocks.storageOptions).toHaveBeenCalledExactlyOnceWith({
			directory: path.join(directory, 'directus-schema-snapshot'),
		})
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'collections.create',
			'collections.update',
			'collections.delete',
			'fields.create',
			'fields.update',
			'fields.delete',
			'relations.create',
			'relations.update',
			'relations.delete',
			'server.stop',
		])
		await handlerFor(action, 'collections.create')()
		await vi.advanceTimersByTimeAsync(5_000)
		await handlerFor(action, 'fields.update')()
		await vi.advanceTimersByTimeAsync(14_999)
		expect(mocks.createSnapshot).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		await vi.waitFor(() =>
			expect(mocks.createSnapshot).toHaveBeenCalledExactlyOnceWith(
				directory,
				context,
				expect.any(AbortSignal),
			),
		)
	})

	it('suppresses triggers and already-scheduled work while the apply flag exists', async () => {
		const { action } = registerHook()
		const flag = path.join(directory, 'directus-schema-applying.flag')
		const trigger = handlerFor(action, 'relations.create')
		await writeFile(flag, 'applying')
		await trigger()
		await vi.advanceTimersByTimeAsync(15_000)
		expect(mocks.createSnapshot).not.toHaveBeenCalled()
		await rm(flag)
		await trigger()
		await writeFile(flag, 'applying')
		await vi.advanceTimersByTimeAsync(15_000)
		expect(mocks.createSnapshot).not.toHaveBeenCalled()
	})

	it('disposes pending snapshot work when Directus stops', async () => {
		const { action } = registerHook()
		await handlerFor(action, 'collections.update')()
		await stop?.()
		await vi.advanceTimersByTimeAsync(30_000)
		expect(mocks.createSnapshot).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})
})
