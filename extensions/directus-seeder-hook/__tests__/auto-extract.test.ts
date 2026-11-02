import type { Logger } from 'pino'

import { existsSync, utimesSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Action = (
	event: string,
	handler: (input: { payload?: Record<string, unknown> }) => void,
) => void
type Register = (
	hooks: { init: ReturnType<typeof vi.fn>; action: Action },
	context: { env: Record<string, unknown>; logger: Logger },
) => void

const mocks = vi.hoisted(() => ({
	directory: '',
	register: vi.fn<Register>(),
	extract: vi.fn(),
	assets: vi.fn(),
}))

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({
	defineHook: (callback: Register) => mocks.register.mockImplementation(callback),
}))
vi.mock('../src/commands/systemCommand', () => ({ registerSystemCommand: vi.fn() }))
vi.mock('../src/commands/extractCommand', () => ({ registerExtractCommand: vi.fn() }))
vi.mock('../src/seeders/system/extract', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/seeders/system/extract')>()),
	extractSeedsFromCollections: mocks.extract,
	extractAssets: mocks.assets,
}))
vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return {
		...actual,
		tmpdir: () => mocks.directory,
		default: { ...actual, tmpdir: () => mocks.directory },
	}
})

import '../src/index'
import { acquireLock, releaseLock } from '../src/lib/processLock'

const logger = pino({ level: 'silent' })
let directory = ''

/**
 * Registers real auto-extraction through the extension's public hook boundary.
 * @param env - Environment overrides controlling subscriptions and automatic extraction.
 * @returns Captured Directus event subscriptions.
 */
function register(env: Record<string, unknown> = {}) {
	const action = vi.fn<Action>()
	mocks.register(
		{ init: vi.fn(), action },
		{
			env: {
				DEPLOYMENT_ENV: 'development',
				SEEDER_AUTO_EXTRACT: true,
				SEEDER_INCLUDE: ['directus_users', 'directus_roles'],
				SEEDER_EXCLUDE: 'directus_roles',
				SEEDER_SEEDS_FOLDER: path.join(directory, 'seeds'),
				SEEDER_ASSETS_DIR: path.join(directory, 'assets'),
				...env,
			},
			logger,
		},
	)
	return action
}

/**
 * Emits a subscribed Directus event with its fixture payload.
 * @param action - Captured event registrations.
 * @param event - Event name to emit.
 * @param payload - Changed fields reported by Directus.
 * @returns Nothing.
 */
function emit(
	action: ReturnType<typeof register>,
	event: string,
	payload?: Record<string, unknown>,
) {
	const handler = action.mock.calls.find(([name]) => name === event)?.[1]
	if (!handler) throw new Error(`No handler for ${event}`)
	handler({ payload })
}

/**
 * Advances the fake clock and filesystem mtime together, as a real debounce window does.
 * @param milliseconds - Time elapsed since the most recent event.
 * @returns Completion of pending task timers.
 */
async function advance(milliseconds: number) {
	const start = Date.now()
	for (const filename of await readdir(directory)) {
		if (filename.startsWith('directus-debounce-')) {
			utimesSync(path.join(directory, filename), new Date(start), new Date(start))
		}
	}
	await vi.advanceTimersByTimeAsync(milliseconds)
}

describe('automatic system extraction', () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		const os = await vi.importActual<typeof import('node:os')>('node:os')
		directory = await mkdtemp(path.join(os.tmpdir(), 'seeder-auto-'))
		mocks.directory = directory
		mocks.extract.mockReset().mockResolvedValue(undefined)
		mocks.assets.mockReset().mockResolvedValue(undefined)
		vi.useFakeTimers()
	})

	afterEach(async () => {
		vi.clearAllTimers()
		vi.useRealTimers()
		await rm(directory, { recursive: true, force: true })
	})

	it('registers filtered CRUD events without the system prefix and supports disabling auto-extraction', () => {
		expect(register().mock.calls.map(([event]) => event)).toEqual([
			'users.create',
			'users.update',
			'users.delete',
		])
		expect(register({ SEEDER_AUTO_EXTRACT: false })).not.toHaveBeenCalled()
	})

	it('debounces repeated events for fifteen seconds and extracts data and assets once', async () => {
		const action = register({ SEEDER_JSON_INDENT: 'space', SEEDER_JSON_INDENT_SIZE: 4 })
		emit(action, 'users.create', { first_name: 'Fixture' })
		await advance(10_000)
		emit(action, 'users.update', { first_name: 'Updated' })
		await advance(14_999)
		expect(mocks.extract).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(1)
		expect(mocks.extract).toHaveBeenCalledOnce()
		expect(mocks.extract).toHaveBeenCalledWith(
			expect.objectContaining({
				jsonIndent: 4,
				folders: {
					seeds: path.join(directory, 'seeds'),
					assets: path.join(directory, 'assets'),
				},
			}),
		)
		expect(mocks.assets).toHaveBeenCalledOnce()
		expect(await readdir(directory)).toEqual([])
	})

	it('extracts data without assets when the validated asset flag is false', async () => {
		const action = register({ SEEDER_EXTRACT_ASSETS: false })
		emit(action, 'users.create', { first_name: 'Fixture' })
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledWith(
			expect.objectContaining({ extractAssets: false, jsonIndent: '\t' }),
		)
		expect(mocks.assets).not.toHaveBeenCalled()
	})

	it('ignores last_page-only and empty user updates while retaining mixed updates', async () => {
		const action = register()
		emit(action, 'users.update', { last_page: '/content' })
		emit(action, 'users.update')
		await advance(15_000)
		expect(mocks.extract).not.toHaveBeenCalled()
		emit(action, 'users.update', { last_page: '/content', first_name: 'Fixture' })
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
	})

	it('skips an existing bulk lock without releasing it and releases its own lock after extraction fails', async () => {
		const action = register()
		const lock = acquireLock()
		try {
			emit(action, 'users.delete')
			await advance(15_000)
			expect(mocks.extract).not.toHaveBeenCalled()
			expect(existsSync(lock)).toBe(true)
		} finally {
			releaseLock()
		}
		mocks.extract.mockRejectedValueOnce(new Error('fixture failure'))
		emit(action, 'users.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		expect(mocks.assets).not.toHaveBeenCalled()
		expect(existsSync(lock)).toBe(false)
		expect(await readdir(directory)).toEqual([])
	})
})
