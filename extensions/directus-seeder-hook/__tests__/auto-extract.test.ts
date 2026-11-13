import type { Logger } from 'pino'

import { existsSync, utimesSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

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
	extract: vi.fn<typeof import('../src/seeders/extract').extractData>(),
	readFiles: vi.fn(),
	readCollection: vi.fn<(collection: string, query: unknown) => Promise<unknown[]>>(),
	getAsset: vi.fn(),
}))

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({
	defineHook: (callback: Register) => mocks.register.mockImplementation(callback),
}))
vi.mock('../src/commands/seedCommand', () => ({ registerSeedCommand: vi.fn() }))
vi.mock('../src/commands/extractCommand', () => ({ registerExtractCommand: vi.fn() }))
vi.mock('../src/seeders/extract', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/seeders/extract')>()),
	extractData: mocks.extract,
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
import { SYSTEM_COLLECTIONS } from '../src/seeders/system/config'

const logger = pino({ level: 'silent' })
let directory = ''

/**
 * Registers real auto-extraction through the extension's public hook boundary.
 * @param env - Environment overrides controlling subscriptions and automatic extraction.
 * @param schema - Live schema fixture for compatible extraction fields.
 * @returns Captured Directus event subscriptions.
 */
function register(
	env: Record<string, unknown> = {},
	schema: unknown = {
		collections: Object.fromEntries(
			SYSTEM_COLLECTIONS.map(({ collection }) => [
				collection,
				{ primary: 'id', fields: { id: { type: 'string' } } },
			]),
		),
	},
) {
	const action = vi.fn<Action>()
	mocks.register(
		{ init: vi.fn(), action },
		{
			env: {
				DEPLOYMENT_ENV: 'development',
				SEEDER_AUTO_EXTRACT_SYSTEM: true,
				SEEDER_INCLUDE: ['directus_users', 'directus_roles'],
				SEEDER_EXCLUDE: 'directus_roles',
				SEEDER_SEEDS_DIR: path.join(directory, 'seeds'),
				SEEDER_ASSETS_DIR: path.join(directory, 'assets'),
				...env,
			},
			logger,
			services: {
				ItemsService: class {
					private readonly collection: string

					/**
					 * Captures the queried collection.
					 * @param collection - Collection being extracted.
					 */
					public constructor(collection: string) {
						this.collection = collection
					}
					/**
					 * Records extraction queries and supplies fixture data.
					 * @param query - Effective collection query.
					 * @returns Fixture records.
					 */
					public readByQuery(query: unknown) {
						return mocks.readCollection(this.collection, query)
					}
				},
				FilesService: class {
					public readByQuery = mocks.readFiles
				},
				AssetsService: class {
					public getAsset = mocks.getAsset
				},
			},
			getSchema: () => Promise.resolve(schema),
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

describe('automatic scoped extraction', () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		const os = await vi.importActual<typeof import('node:os')>('node:os')
		directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'seeder-auto-')))
		mocks.directory = directory
		mocks.extract.mockReset().mockResolvedValue(undefined)
		mocks.readFiles.mockReset().mockResolvedValue([])
		mocks.readCollection.mockReset().mockResolvedValue([])
		mocks.getAsset.mockReset()
		vi.useFakeTimers()
	})

	afterEach(async () => {
		vi.clearAllTimers()
		vi.useRealTimers()
		await rm(directory, { recursive: true, force: true })
	})

	/**
	 * Declares two core collections for selection and manifest regression cases.
	 * @returns Environment pointing to the consumer configuration.
	 */
	async function coreEnvironment() {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				core: {
					collections: {
						posts: { operationMode: 'insert-update', management: { type: 'manifest' } },
						tags: { operationMode: 'insert-update' },
					},
				},
			}),
		)
		return {
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_AUTO_EXTRACT_CORE: true,
			SEEDER_INCLUDE: ['directus_users', 'directus_files', 'posts', 'tags'],
			SEEDER_EXCLUDE: ['directus_files', 'tags'],
		}
	}

	it.each([
		[false, false],
		[true, false],
		[false, true],
		[true, true],
	])(
		'registers only selected collections in enabled scopes (system=%s, core=%s)',
		async (system, core) => {
			const action = register({
				...(await coreEnvironment()),
				SEEDER_AUTO_EXTRACT_SYSTEM: system,
				SEEDER_AUTO_EXTRACT_CORE: core,
			})
			expect(action.mock.calls.map(([event]) => event)).toEqual([
				...(system ? ['users.create', 'users.update', 'users.delete'] : []),
				...(core ? ['posts.items.create', 'posts.items.update', 'posts.items.delete'] : []),
				'server.stop',
				'extensions.unload',
			])
		},
	)

	it.each([undefined, 'production', 'Development', 'staging', ''])(
		'requires the exact development environment for either automatic scope (%s)',
		async (DEPLOYMENT_ENV) => {
			expect(
				register({ ...(await coreEnvironment()), DEPLOYMENT_ENV }),
			).not.toHaveBeenCalled()
		},
	)

	it('validates the shared allowlist against configured names even when scopes are disabled', async () => {
		const environment = await coreEnvironment()
		const action = register({
			...environment,
			SEEDER_AUTO_EXTRACT_SYSTEM: false,
			SEEDER_AUTO_EXTRACT_INCLUDE: ['directus_files', 'tags'],
		})
		// Explicit selection overrides the general exclusion, but cannot enable system.
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'tags.items.create',
			'tags.items.update',
			'tags.items.delete',
			'server.stop',
			'extensions.unload',
		])
		for (const DEPLOYMENT_ENV of ['development', 'production']) {
			expect(() =>
				register({
					...environment,
					DEPLOYMENT_ENV,
					SEEDER_AUTO_EXTRACT_SYSTEM: false,
					SEEDER_AUTO_EXTRACT_CORE: false,
					SEEDER_AUTO_EXTRACT_INCLUDE: ['directus_files', 'undeclared'],
				}),
			).toThrow('SEEDER_AUTO_EXTRACT_INCLUDE')
		}
	})

	it.each([false, true])(
		'debounces both scopes for fifteen seconds under one lock with allowlist=%s',
		async (allowlist) => {
			const action = register({
				...(await coreEnvironment()),
				SEEDER_JSON_INDENT: 'space',
				SEEDER_JSON_INDENT_SIZE: 4,
				...(allowlist ? { SEEDER_AUTO_EXTRACT_INCLUDE: ['posts', 'directus_users'] } : {}),
			})
			mocks.extract.mockImplementation(() => {
				expect(existsSync(path.join(directory, 'directus-lock-bulk-operation.flag'))).toBe(
					true,
				)
				return Promise.resolve()
			})
			emit(action, 'posts.items.create')
			await advance(10_000)
			emit(action, 'users.create')
			emit(action, 'posts.items.update')
			await advance(14_999)
			expect(mocks.extract).not.toHaveBeenCalled()
			await vi.advanceTimersByTimeAsync(1)
			expect(mocks.extract.mock.calls.map(([options]) => options.dataScope)).toEqual([
				'system',
				'core',
			])
			expect(existsSync(path.join(directory, 'directus-lock-bulk-operation.flag'))).toBe(
				false,
			)
			expect((await readdir(directory)).sort()).toEqual(['consumer.json'])
			expect(mocks.extract).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					jsonIndent: 4,
					folders: {
						seeds: path.join(directory, 'seeds', 'system'),
						assets: path.join(directory, 'assets'),
					},
				}),
			)
			expect(mocks.extract.mock.calls.map(([options]) => options.skipClean)).toEqual([
				allowlist,
				allowlist,
			])
			expect(mocks.extract.mock.calls.map(([options]) => options.jsonOnly)).toEqual([
				allowlist,
				true,
			])
		},
	)

	it('cancels pending extraction on server stop and ignores subsequent events', async () => {
		const action = register()
		emit(action, 'users.create')
		emit(action, 'server.stop')
		emit(action, 'server.stop')
		emit(action, 'users.update', { first_name: 'After disposal' })
		expect(vi.getTimerCount()).toBe(0)
		await advance(15_000)
		expect(mocks.extract).not.toHaveBeenCalled()
	})

	it('lets running extraction finish after unload without scheduling pending events', async () => {
		let finish: (() => void) | undefined
		mocks.extract.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve
				}),
		)
		const action = register()
		emit(action, 'users.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		emit(action, 'users.update', { first_name: 'While running' })
		emit(action, 'extensions.unload')
		const schedule = vi.spyOn(globalThis, 'setTimeout')
		finish?.()
		await vi.advanceTimersByTimeAsync(0)
		expect(schedule).not.toHaveBeenCalled()
		expect(existsSync(path.join(directory, 'directus-lock-bulk-operation.flag'))).toBe(false)
	})

	it.each([1_000, 16_000])(
		'retains events during extraction without concurrent writes after %sms',
		async (delay) => {
			const action = register(await coreEnvironment())
			let finish: (() => void) | undefined
			mocks.extract.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						finish = resolve
					}),
			)
			emit(action, 'users.create')
			await advance(15_000)
			expect(mocks.extract).toHaveBeenCalledOnce()
			emit(action, 'posts.items.update')
			await advance(delay)
			expect(mocks.extract).toHaveBeenCalledOnce()
			finish?.()
			// Let the original task release its lock and schedule the remaining debounce window.
			await vi.advanceTimersByTimeAsync(Math.max(0, 15_000 - delay) + 1)
			expect(mocks.extract.mock.calls.map(([options]) => options.dataScope)).toEqual([
				'system',
				'core',
			])
			expect(existsSync(path.join(directory, 'directus-lock-bulk-operation.flag'))).toBe(
				false,
			)
		},
	)

	it('attempts core after a system failure and discards both scopes when a bulk import suppresses extraction', async () => {
		const action = register(await coreEnvironment())
		const lock = acquireLock()
		try {
			emit(action, 'users.create')
			emit(action, 'posts.items.create')
			await advance(15_000)
			expect(mocks.extract).not.toHaveBeenCalled()
			expect(existsSync(lock.path)).toBe(true)
		} finally {
			lock.release()
		}
		emit(action, 'posts.items.update')
		await advance(15_000)
		expect(mocks.extract.mock.calls.map(([options]) => options.dataScope)).toEqual(['core'])
		mocks.extract.mockClear().mockRejectedValueOnce(new Error('system failure'))
		emit(action, 'users.create')
		emit(action, 'posts.items.delete')
		await advance(15_000)
		expect(mocks.extract.mock.calls.map(([options]) => options.dataScope)).toEqual([
			'system',
			'core',
		])
		expect(existsSync(lock.path)).toBe(false)
		expect(await readdir(directory)).toEqual(['consumer.json'])
	})

	it.each([false, true])(
		'keeps core cleanup, manifests and binary handling isolated with allowlist=%s',
		async (allowlist) => {
			const actual =
				await vi.importActual<typeof import('../src/seeders/extract')>(
					'../src/seeders/extract',
				)
			mocks.extract.mockImplementation(actual.extractData)
			const environment = await coreEnvironment()
			const system = path.join(directory, 'seeds', 'system')
			const core = path.join(directory, 'seeds', 'core')
			const assets = path.join(system, 'assets')
			await mkdir(assets, { recursive: true })
			await mkdir(core, { recursive: true })
			await writeFile(path.join(system, 'untouched.json'), 'system')
			await writeFile(path.join(system, 'directus_files.managed-ids.json'), 'system history')
			await writeFile(path.join(assets, 'old.bin'), 'binary')
			await writeFile(path.join(core, 'stale.json'), 'stale')
			await writeFile(path.join(core, 'posts.managed-ids.json'), '["old"]')
			await writeFile(path.join(core, 'tags.managed-ids.json'), 'unselected history')
			mocks.readCollection.mockResolvedValue([{ slug: 'new', title: 'Created' }])
			const action = register(
				{
					...environment,
					SEEDER_ASSETS_DIR: assets,
					...(allowlist
						? { SEEDER_AUTO_EXTRACT_INCLUDE: ['posts', 'directus_files'] }
						: {}),
				},
				{
					collections: {
						posts: { primary: 'slug', fields: { slug: { type: 'string' } } },
					},
				},
			)
			emit(action, 'posts.items.create')
			await advance(15_000)
			await expect(mocks.extract.mock.results[0]?.value).resolves.toBeUndefined()
			expect(mocks.readCollection.mock.calls.map(([name]) => name)).toEqual(['posts'])
			expect(JSON.parse(await readFile(path.join(core, 'posts.json'), 'utf8'))).toEqual([
				{ slug: 'new', title: 'Created' },
			])
			expect(
				JSON.parse(await readFile(path.join(core, 'posts.managed-ids.json'), 'utf8')),
			).toEqual(['new', 'old'])
			expect(await readFile(path.join(core, 'tags.managed-ids.json'), 'utf8')).toBe(
				'unselected history',
			)
			if (allowlist)
				expect(await readFile(path.join(core, 'stale.json'), 'utf8')).toBe('stale')
			else
				await expect(readFile(path.join(core, 'stale.json'))).rejects.toMatchObject({
					code: 'ENOENT',
				})
			expect(await readFile(path.join(system, 'untouched.json'), 'utf8')).toBe('system')
			expect(
				await readFile(path.join(system, 'directus_files.managed-ids.json'), 'utf8'),
			).toBe('system history')
			expect(await readFile(path.join(assets, 'old.bin'), 'utf8')).toBe('binary')
			expect(mocks.readFiles).not.toHaveBeenCalled()
			expect(mocks.getAsset).not.toHaveBeenCalled()
		},
	)

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

	it('extracts the whole allowlist in effective order while preserving other output', async () => {
		const actual =
			await vi.importActual<typeof import('../src/seeders/extract')>('../src/seeders/extract')
		mocks.extract.mockImplementation(actual.extractData)
		const seeds = path.join(directory, 'seeds', 'system')
		const assets = path.join(seeds, 'assets')
		await mkdir(assets, { recursive: true })
		await writeFile(path.join(seeds, 'unrelated.json'), 'unrelated')
		await writeFile(path.join(seeds, 'directus_roles.json'), 'old roles')
		await writeFile(path.join(assets, 'old.bin'), 'old asset')
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					order: ['directus_presets'],
					collections: {
						directus_presets: {
							fields: ['id', 'role'],
							filter: { user: { _null: true } },
							sort: ['id'],
							deep: { role: { _limit: 1 } },
							management: { type: 'id-range', min: 10, max: 50000 },
						},
					},
				},
			}),
		)
		const action = register({
			SEEDER_AUTO_EXTRACT_INCLUDE: ['directus_roles', 'directus_presets'],
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_ASSETS_DIR: assets,
		})
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'presets.create',
			'roles.create',
			'presets.update',
			'roles.update',
			'presets.delete',
			'roles.delete',
			'server.stop',
			'extensions.unload',
		])
		emit(action, 'roles.create')
		await advance(15_000)
		expect(mocks.extract).toHaveBeenCalledOnce()
		await expect(mocks.extract.mock.results[0]?.value).resolves.toBeUndefined()
		expect(mocks.readCollection.mock.calls.map(([collection]) => collection)).toEqual([
			'directus_presets',
			'directus_roles',
		])
		expect(mocks.readCollection).toHaveBeenCalledWith('directus_presets', {
			limit: -1,
			fields: ['id', 'role'],
			sort: ['id'],
			deep: { role: { _limit: 1 } },
			filter: {
				_and: [{ user: { _null: true } }, { id: { _gte: 10 } }, { id: { _lt: 50000 } }],
			},
		})
		expect(await readFile(path.join(seeds, 'directus_roles.json'), 'utf8')).toBe('[]\n')
		expect(await readFile(path.join(seeds, 'directus_presets.json'), 'utf8')).toBe('[]\n')
		expect(await readFile(path.join(seeds, 'unrelated.json'), 'utf8')).toBe('unrelated')
		expect(await readFile(path.join(assets, 'old.bin'), 'utf8')).toBe('old asset')
		expect(mocks.readFiles).not.toHaveBeenCalled()
		expect(mocks.getAsset).not.toHaveBeenCalled()
	})

	it('updates only selected manifests during automatic extraction and preserves history through empty results', async () => {
		const actual =
			await vi.importActual<typeof import('../src/seeders/extract')>('../src/seeders/extract')
		mocks.extract.mockImplementation(actual.extractData)
		const seeds = path.join(directory, 'seeds', 'system')
		await mkdir(seeds, { recursive: true })
		const manifest = path.join(seeds, 'directus_access.managed-ids.json')
		const untouched = path.join(seeds, 'directus_roles.managed-ids.json')
		const first = '10c85a66-944d-483c-8d74-602cc615f324'
		const historical = '6d6a24a9-0575-4eb0-92e1-a74cf88824bd'
		await writeFile(manifest, JSON.stringify([historical]))
		await writeFile(untouched, 'unselected manifest')
		await writeFile(path.join(seeds, 'unrelated.json'), 'unrelated')
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_access: { fields: ['id'], management: { type: 'manifest' } },
						directus_roles: { management: { type: 'manifest' } },
					},
				},
			}),
		)
		mocks.readCollection.mockResolvedValue([{ id: first }])
		const action = register(
			{ SEEDER_CONFIG_PATH: configPath, SEEDER_AUTO_EXTRACT_INCLUDE: ['directus_access'] },
			{
				collections: {
					directus_access: { primary: 'id', fields: { id: { type: 'uuid' } } },
				},
			},
		)
		emit(action, 'access.create')
		await advance(15_000)
		await expect(mocks.extract.mock.results[0]?.value).resolves.toBeUndefined()
		const history = await readFile(manifest, 'utf8')
		expect(JSON.parse(history)).toEqual([first, historical])
		expect(
			JSON.parse(await readFile(path.join(seeds, 'directus_access.json'), 'utf8')),
		).toEqual([{ id: first }])
		mocks.readCollection.mockResolvedValue([])
		emit(action, 'access.delete')
		await advance(15_000)
		await expect(mocks.extract.mock.results[1]?.value).resolves.toBeUndefined()
		expect(await readFile(manifest, 'utf8')).toBe(history)
		expect(await readFile(path.join(seeds, 'directus_access.json'), 'utf8')).toBe('[]\n')
		expect(await readFile(untouched, 'utf8')).toBe('unselected manifest')
		expect(await readFile(path.join(seeds, 'unrelated.json'), 'utf8')).toBe('unrelated')
		expect(mocks.readCollection.mock.calls.map(([collection]) => collection)).toEqual([
			'directus_access',
			'directus_access',
		])
		expect(mocks.readFiles).not.toHaveBeenCalled()
	})

	it('exports new, updated and deleted policies automatically while preserving other output', async () => {
		const actual =
			await vi.importActual<typeof import('../src/seeders/extract')>('../src/seeders/extract')
		mocks.extract.mockImplementation(actual.extractData)
		const seeds = path.join(directory, 'seeds', 'system')
		const assets = path.join(seeds, 'assets')
		await mkdir(assets, { recursive: true })
		const policy = '6d6a24a9-0575-4eb0-92e1-a74cf88824bd'
		const added = '10c85a66-944d-483c-8d74-602cc615f324'
		const source = path.join(seeds, 'directus_policies.json')
		const target = path.join(seeds, 'directus_permissions.json')
		await writeFile(source, JSON.stringify([{ id: policy }]))
		await writeFile(target, 'old permissions')
		await writeFile(path.join(seeds, 'unrelated.json'), 'unrelated')
		await writeFile(path.join(assets, 'old.bin'), 'old asset')
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_permissions: {
							management: {
								type: 'relation',
								field: 'policy',
								collection: 'directus_policies',
							},
						},
					},
				},
			}),
		)
		let policies: { id: string; name?: string }[] = [{ id: policy }, { id: added }]
		mocks.readCollection.mockImplementation((collection) =>
			Promise.resolve(collection === 'directus_policies' ? policies : [{ id: 1, policy }]),
		)
		const action = register({
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_AUTO_EXTRACT_INCLUDE: ['directus_policies', 'directus_permissions'],
			SEEDER_ASSETS_DIR: assets,
		})
		for (const [index, event] of [
			'policies.create',
			'policies.update',
			'policies.delete',
		].entries()) {
			if (event === 'policies.update')
				policies = [{ id: policy, name: 'Updated' }, { id: added }]
			if (event === 'policies.delete') policies = []
			emit(action, event)
			await advance(15_000)
			await expect(mocks.extract.mock.results[index]?.value).resolves.toBeUndefined()
			expect(JSON.parse(await readFile(source, 'utf8'))).toEqual(policies)
			expect(JSON.parse(await readFile(target, 'utf8'))).toEqual([{ id: 1, policy }])
		}
		expect(await readFile(path.join(seeds, 'unrelated.json'), 'utf8')).toBe('unrelated')
		expect(await readFile(path.join(assets, 'old.bin'), 'utf8')).toBe('old asset')
		expect(mocks.readFiles).not.toHaveBeenCalled()
	})

	it.each([false, true])(
		'preserves stale assets and exports selected file JSON with jsonOnly=%s',
		async (jsonOnly) => {
			const actual =
				await vi.importActual<typeof import('../src/seeders/extract')>(
					'../src/seeders/extract',
				)
			mocks.extract.mockImplementation(actual.extractData)
			const seeds = path.join(directory, 'seeds', 'system')
			const assets = path.join(seeds, 'assets')
			await mkdir(assets, { recursive: true })
			await writeFile(path.join(seeds, 'directus_roles.json'), 'untouched roles')
			await writeFile(path.join(assets, 'old.bin'), 'old asset')
			const files = [{ id: 'fixture-file', filename_disk: 'new.bin' }]
			mocks.readCollection.mockResolvedValue(files)
			mocks.readFiles.mockResolvedValue(files)
			mocks.getAsset.mockResolvedValue({ stream: Readable.from([Buffer.from('new asset')]) })
			const action = register({
				SEEDER_AUTO_EXTRACT_INCLUDE: 'directus_files',
				SEEDER_JSON_ONLY: jsonOnly,
				SEEDER_ASSETS_DIR: assets,
			})
			emit(action, 'files.update')
			await advance(15_000)
			await expect(mocks.extract.mock.results[0]?.value).resolves.toBeUndefined()
			expect(
				JSON.parse(await readFile(path.join(seeds, 'directus_files.json'), 'utf8')),
			).toEqual(files)
			expect(await readFile(path.join(seeds, 'directus_roles.json'), 'utf8')).toBe(
				'untouched roles',
			)
			expect(await readFile(path.join(assets, 'old.bin'), 'utf8')).toBe('old asset')
			if (jsonOnly) {
				expect(mocks.readFiles).not.toHaveBeenCalled()
				expect(mocks.getAsset).not.toHaveBeenCalled()
				expect(await readdir(assets)).toEqual(['old.bin'])
			} else {
				expect(mocks.readFiles).toHaveBeenCalledOnce()
				expect(mocks.getAsset).toHaveBeenCalledWith('fixture-file')
				expect(await readFile(path.join(assets, 'new.bin'), 'utf8')).toBe('new asset')
			}
		},
	)

	it.each([false, true])('cleans real automatic output with jsonOnly=%s', async (jsonOnly) => {
		const actual =
			await vi.importActual<typeof import('../src/seeders/extract')>('../src/seeders/extract')
		mocks.extract.mockImplementation(actual.extractData)
		const seeds = path.join(directory, 'seeds', 'system')
		const assets = path.join(seeds, 'assets')
		await mkdir(assets, { recursive: true })
		await writeFile(path.join(seeds, 'stale.json'), 'stale')
		const core = path.join(directory, 'seeds', 'core')
		await mkdir(core, { recursive: true })
		await writeFile(path.join(core, 'untouched.json'), 'core')
		await writeFile(path.join(core, 'posts.managed-ids.json'), 'core history')
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
		expect(await readFile(path.join(core, 'untouched.json'), 'utf8')).toBe('core')
		expect(await readFile(path.join(core, 'posts.managed-ids.json'), 'utf8')).toBe(
			'core history',
		)
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
