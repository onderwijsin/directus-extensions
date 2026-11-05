import type { Logger } from 'pino'

import { existsSync, utimesSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Action = (
	event: string,
	handler: (input: { payload?: Record<string, unknown> }) => void,
) => void
type Register = (
	hooks: { init: ReturnType<typeof vi.fn>; action: Action },
	context: {
		env: Record<string, unknown>
		logger: Logger
		services: Record<string, unknown>
		getSchema: () => Promise<unknown>
		database: object
	},
) => void

const mocks = vi.hoisted(() => ({
	directory: '',
	register: vi.fn<Register>(),
	extract: vi.fn(),
	readFiles: vi.fn(),
}))

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({
	defineHook: (callback: Register) => mocks.register.mockImplementation(callback),
}))
vi.mock('../src/commands/systemCommand', () => ({ registerSystemCommand: vi.fn() }))
vi.mock('../src/commands/extractCommand', () => ({ registerExtractCommand: vi.fn() }))
vi.mock('../src/seeders/system/extract', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/seeders/system/extract')>()),
	extractSystemData: mocks.extract,
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
import { acquireLock } from '../src/lib/processLock'

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
				SEEDER_SEEDS_DIR: path.join(directory, 'seeds'),
				SEEDER_ASSETS_DIR: path.join(directory, 'assets'),
				...env,
			},
			logger,
			services: {
				ItemsService: class {
					/** @returns Empty collection data for automatic extraction. */
					public readByQuery() {
						return Promise.resolve([])
					}
				},
				FilesService: class {
					public readByQuery = mocks.readFiles
				},
			},
			getSchema: () => Promise.resolve({}),
			database: {},
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
		directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'seeder-auto-')))
		mocks.directory = directory
		mocks.extract.mockReset().mockResolvedValue(undefined)
		mocks.readFiles.mockReset().mockResolvedValue([])
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

	it('debounces repeated events for fifteen seconds and calls the shared extractor once', async () => {
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
				skipClean: false,
				jsonOnly: false,
				jsonIndent: 4,
				folders: {
					seeds: path.join(directory, 'seeds'),
					assets: path.join(directory, 'assets'),
				},
			}),
		)
		expect(await readdir(directory)).toEqual([])
	})

	it('passes the captured effective JSON collection config to shared automatic extraction', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_users: {
							fields: ['id', 'email'],
							filter: { status: { _eq: 'active' } },
						},
					},
				},
			}),
		)
		const action = register({ SEEDER_CONFIG_PATH: configPath })
		await writeFile(configPath, '{changed after registration')
		emit(action, 'users.create', { first_name: 'Fixture' })
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledWith(
			expect.objectContaining({
				systemCollections: expect.arrayContaining([
					expect.objectContaining({
						collection: 'directus_users',
						fields: ['id', 'email'],
						filter: { status: { _eq: 'active' } },
					}),
				]),
			}),
		)
	})

	it('preserves a replacement flag when an expired auto-extraction fails', async () => {
		let fail: ((error: Error) => void) | undefined
		mocks.extract.mockReturnValueOnce(
			new Promise<void>((_resolve, reject) => {
				fail = reject
			}),
		)
		emit(register(), 'users.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		const flag = path.join(directory, 'directus-lock-bulk-operation.flag')
		const staleTime = new Date(Date.now() - 301_000)
		utimesSync(flag, staleTime, staleTime)
		const replacement = acquireLock()
		const replacementFlag = await readFile(flag, 'utf8')
		try {
			fail?.(new Error('expired task failure'))
			await vi.waitFor(async () => {
				expect(await readdir(directory)).toEqual(['directus-lock-bulk-operation.flag'])
			})
			expect(await readFile(flag, 'utf8')).toBe(replacementFlag)
		} finally {
			expect(replacement.release()).toBe(true)
			expect(replacement.release()).toBe(false)
		}
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
			expect(existsSync(lock.path)).toBe(true)
		} finally {
			lock.release()
		}
		mocks.extract.mockRejectedValueOnce(new Error('fixture failure'))
		emit(action, 'users.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		expect(existsSync(lock.path)).toBe(false)
		expect(await readdir(directory)).toEqual([])
	})

	it.each([false, true])('cleans real automatic output with jsonOnly=%s', async (jsonOnly) => {
		const actual = await vi.importActual<typeof import('../src/seeders/system/extract')>(
			'../src/seeders/system/extract',
		)
		mocks.extract.mockImplementation(actual.extractSystemData)
		const seeds = path.join(directory, 'seeds')
		const assets = path.join(seeds, 'assets')
		await mkdir(assets, { recursive: true })
		await writeFile(path.join(seeds, 'stale.json'), 'stale')
		await writeFile(path.join(seeds, 'directus_users.json'), 'stale users')
		await writeFile(path.join(assets, 'binary.bin'), 'bytes')
		await writeFile(path.join(assets, 'binary.json'), 'asset bytes')
		const action = register({ SEEDER_JSON_ONLY: jsonOnly, SEEDER_ASSETS_DIR: assets })
		emit(action, 'users.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		await expect(mocks.extract.mock.results[0]?.value).resolves.toBeUndefined()
		await expect(readFile(path.join(seeds, 'stale.json'))).rejects.toMatchObject({
			code: 'ENOENT',
		})
		expect(await readFile(path.join(seeds, 'directus_users.json'), 'utf8')).toBe('[]\n')
		if (jsonOnly) {
			expect(await readFile(path.join(assets, 'binary.bin'), 'utf8')).toBe('bytes')
			expect(await readFile(path.join(assets, 'binary.json'), 'utf8')).toBe('asset bytes')
			expect(mocks.readFiles).not.toHaveBeenCalled()
		} else {
			expect(await readdir(assets)).toEqual([])
			expect(mocks.readFiles).toHaveBeenCalledOnce()
		}
	})
})
