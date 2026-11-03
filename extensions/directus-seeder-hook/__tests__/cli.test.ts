import type { Logger } from 'pino'

import {
	link,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { Readable } from 'node:stream'

import { Command } from 'commander'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Init = (event: string, handler: (metadata: { program: Command }) => void) => void
interface TestContext {
	env: Record<string, unknown>
	logger: Logger
	services: Record<string, unknown>
	getSchema: () => Promise<unknown>
	database: object
}
type HookRegister = (
	hooks: { init: Init; action: ReturnType<typeof vi.fn> },
	context: TestContext,
) => void

const mocks = vi.hoisted(() => ({
	register: vi.fn<HookRegister>(),
	autoExtract: vi.fn(),
	acquireLock: vi.fn(),
	releaseLock: vi.fn(() => true),
}))

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({
	defineHook: (callback: HookRegister) => mocks.register.mockImplementation(callback),
}))
vi.mock('../src/seeders/system/autoExtract', () => ({
	registerAutoExtractSystemHook: mocks.autoExtract,
}))
vi.mock('../src/lib/processLock', () => ({
	acquireLock: mocks.acquireLock,
	releaseLock: mocks.releaseLock,
}))

import '../src/index'

const logger = pino({ level: 'silent' })
let directory = ''

/** Represents the host CLI's deliberate process exit without terminating Vitest. */
class CliExit extends Error {
	public readonly code: string | number | null | undefined

	/**
	 * Stores the exit code requested by the command.
	 * @param code - Requested process status.
	 */
	public constructor(code: string | number | null | undefined) {
		super(`CLI exited with ${code}`)
		this.code = code
	}
}

/**
 * Registers the real hook and CLI against observable, structural Directus services.
 * @param env - Environment overrides supplied to Directus.
 * @returns The real program and service spies.
 */
function createProgram(env: Record<string, unknown> = {}) {
	const readByQuery = vi.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
	const createMany = vi.fn().mockResolvedValue([])
	const upsertMany = vi.fn().mockResolvedValue([1])
	const deleteMany = vi.fn().mockResolvedValue([])
	const clearCache = vi.fn().mockResolvedValue(undefined)
	const readFiles = vi.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
	const uploadOne =
		vi.fn<
			(
				stream: Readable,
				data: Record<string, unknown>,
				id?: unknown,
			) => Promise<string | number>
		>()
	const getAsset = vi.fn<(id: string) => Promise<{ stream: Readable }>>()
	const ItemsService = vi.fn(function () {
		return { readByQuery, createMany, upsertMany, deleteMany }
	})
	const FilesService = vi.fn(function () {
		return { readByQuery: readFiles, uploadOne }
	})
	const AssetsService = vi.fn(function () {
		return { getAsset }
	})
	const UtilsService = vi.fn(function () {
		return { clearCache }
	})
	const context: TestContext = {
		env: {
			SEEDER_SEEDS_DIR: directory,
			SEEDER_ASSETS_DIR: path.join(directory, 'assets'),
			...env,
		},
		logger,
		services: { ItemsService, FilesService, AssetsService, UtilsService },
		getSchema: () => Promise.resolve({}),
		database: {},
	}
	const init = vi.fn<Init>()
	const action = vi.fn()
	mocks.register({ init, action }, context)
	const writeErr = vi.fn()
	const program = new Command().exitOverride().configureOutput({ writeErr })
	init.mock.calls.find(([event]) => event === 'cli.after')?.[1]({ program })
	return {
		program,
		init,
		action,
		readByQuery,
		createMany,
		upsertMany,
		ItemsService,
		clearCache,
		readFiles,
		uploadOne,
		getAsset,
		context,
		writeErr,
	}
}

/**
 * Executes Commander and returns the exit status requested after command cleanup.
 * @param program - Registered host CLI.
 * @param args - Arguments following the seed namespace.
 * @returns The deliberate command exit code.
 */
async function runCommand(program: Command, ...args: string[]) {
	try {
		await program.parseAsync(['seed', ...args], { from: 'user' })
	} catch (error) {
		if (error instanceof CliExit) return error.code
		throw error
	}
	throw new Error('Expected the CLI action to request a process exit')
}

describe('seeder registration and CLI', () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		directory = await realpath(await mkdtemp(path.join(tmpdir(), 'seeder-cli-')))
		vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new CliExit(code)
		})
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	it('registers seed system and development extraction with the validated environment defaults', () => {
		const { program, action } = createProgram({ DEPLOYMENT_ENV: 'development' })
		expect(program.commands.map((command) => command.name())).toEqual(['seed'])
		expect(program.commands[0]?.commands.map((command) => command.name())).toEqual([
			'system',
			'extract',
		])
		expect(mocks.autoExtract).toHaveBeenCalledWith(action, expect.any(Object))
	})

	it('keeps extraction unavailable outside the exact development environment', () => {
		for (const DEPLOYMENT_ENV of [undefined, 'production', 'Development']) {
			expect(
				createProgram({ DEPLOYMENT_ENV }).program.commands[0]?.commands.map((command) =>
					command.name(),
				),
			).toEqual(['system'])
		}
		expect(mocks.autoExtract).not.toHaveBeenCalled()
	})

	it('does not register CLI or auto-extraction when explicitly disabled', () => {
		for (const SEEDER_ENABLED of [false, 'false']) {
			const { program, init } = createProgram({
				DEPLOYMENT_ENV: 'development',
				SEEDER_ENABLED,
				SEEDER_JSON_INDENT: 'invalid',
			})
			expect(init).not.toHaveBeenCalled()
			expect(program.commands).toEqual([])
		}
		expect(mocks.autoExtract).not.toHaveBeenCalled()
	})

	it('blocks full-idempotent without its environment opt-in and releases the process lock', async () => {
		const { program, ItemsService } = createProgram()
		expect(await runCommand(program, 'system', '--mode', 'full-idempotent', '--force')).toBe(1)
		expect(ItemsService).not.toHaveBeenCalled()
		expect(mocks.acquireLock).toHaveBeenCalledOnce()
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it('seeds settings as a singleton row, applies include/exclude, and clears the system cache', async () => {
		await writeFile(
			path.join(directory, 'directus_settings.json'),
			JSON.stringify([{ id: 1, project_name: 'Fixture' }]),
		)
		const service = createProgram()
		service.readByQuery.mockResolvedValue([{ id: 1 }])
		expect(
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-update',
				'--include',
				'directus_settings',
				'directus_roles',
				'--exclude',
				'directus_roles',
				'--yes',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_settings',
			expect.any(Object),
		)
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith([
			{ id: 1, project_name: 'Fixture' },
		])
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it('extracts settings without license secrets and sorts operation dependencies before dependents', async () => {
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		service.readByQuery
			.mockResolvedValueOnce([
				{ id: 'dependent', resolve: 'dependency', reject: null },
				{ id: 'dependency', resolve: null, reject: null },
			])
			.mockResolvedValueOnce([
				{
					id: 1,
					project_name: 'Fixture',
					license_key: 'secret',
					license_token: 'secret-token',
				},
			])
		expect(
			await runCommand(
				service.program,
				'extract',
				'--include',
				'directus_settings',
				'directus_operations',
			),
		).toBe(0)
		expect(
			JSON.parse(await readFile(path.join(directory, 'directus_operations.json'), 'utf8')),
		).toEqual([
			{ id: 'dependency', resolve: null, reject: null },
			{ id: 'dependent', resolve: 'dependency', reject: null },
		])
		expect(
			JSON.parse(await readFile(path.join(directory, 'directus_settings.json'), 'utf8')),
		).toEqual([{ id: 1, project_name: 'Fixture' }])
		expect(service.readByQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({ fields: ['*'], limit: -1 }),
		)
	})

	it('uploads local asset bytes with untouched metadata and extracts the streamed bytes again', async () => {
		const bytes = Buffer.from([0, 255, 1, 13, 10, 128, 2])
		const filename = 'fixture.bin'
		const assetPath = path.join(directory, 'assets', filename)
		await mkdir(path.dirname(assetPath))
		await writeFile(assetPath, bytes)
		const rows = [
			{ id: 7, filename_disk: filename, storage: false },
			{ id: 'fallback', filename_disk: filename },
		]
		await writeFile(path.join(directory, 'directus_files.json'), JSON.stringify(rows))
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			STORAGE_LOCATIONS: ['primary', 'secondary'],
		})
		const uploadedBytes: Buffer[] = []
		service.uploadOne.mockImplementation(async (stream, _data, id) => {
			uploadedBytes.push(
				await new Promise<Buffer>((resolve, reject) => {
					const chunks: Buffer[] = []
					stream.on('data', (chunk: Buffer) => chunks.push(chunk))
					stream.once('end', () => resolve(Buffer.concat(chunks)))
					stream.once('error', reject)
				}),
			)
			return typeof id === 'number' || typeof id === 'string' ? id : 'uploaded'
		})
		expect(await runCommand(service.program, 'system', '--include', 'directus_files')).toBe(0)
		expect(uploadedBytes).toEqual([bytes, bytes])
		expect(service.uploadOne.mock.calls.map(([, data, id]) => ({ data, id }))).toEqual([
			{ data: rows[0], id: 7 },
			{ data: { ...rows[1], storage: 'primary' }, id: 'fallback' },
		])
		await rm(assetPath)
		service.readFiles.mockResolvedValue([{ id: 'fallback', filename_disk: filename }])
		service.getAsset.mockResolvedValue({
			stream: Readable.from([bytes.subarray(0, 3), bytes.subarray(3)]),
		})
		expect(
			await runCommand(service.program, 'extract', '--include', 'directus_files', '--assets'),
		).toBe(0)
		expect(service.getAsset).toHaveBeenCalledExactlyOnceWith('fallback')
		expect(await readFile(assetPath)).toEqual(bytes)
	})

	it.each([
		{ style: undefined, size: undefined, indent: '\t' },
		{ style: 'tab', size: 8, indent: '\t' },
		{ style: 'space', size: undefined, indent: 2 },
		{ style: 'space', size: 1, indent: 1 },
		{ style: 'space', size: 4, indent: 4 },
		{ style: 'space', size: 10, indent: 10 },
	])('serializes extracted records with $style / $size', async ({ style, size, indent }) => {
		const records = [{ id: 'role-1', name: 'Editor', nested: { enabled: true } }]
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_JSON_INDENT: style,
			SEEDER_JSON_INDENT_SIZE: size,
		})
		service.readByQuery.mockResolvedValue(records)
		expect(await runCommand(service.program, 'extract', '--include', 'directus_roles')).toBe(0)
		const output = await readFile(path.join(directory, 'directus_roles.json'), 'utf8')
		expect(output).toBe(`${JSON.stringify(records, null, indent)}\n`)
		expect(output).toMatch(/[^\n]\n$/u)
		expect(JSON.parse(output)).toEqual(records)
	})

	it.each(['', '2', '4', 2, 4, 0, null, true])(
		'rejects invalid indentation %s at startup before registration',
		(value) => {
			const info = vi.spyOn(logger, 'info')
			const init = vi.fn<Init>()
			const action = vi.fn()
			expect(() =>
				mocks.register(
					{ init, action },
					{
						env: { DEPLOYMENT_ENV: 'development', SEEDER_JSON_INDENT: value },
						logger,
						services: {},
						getSchema: () => Promise.resolve({}),
						database: {},
					},
				),
			).toThrow('Invalid extension options')
			expect(info).toHaveBeenCalledWith(
				expect.stringContaining('SEEDER_JSON_INDENT must be tab or space'),
			)
			expect(init).not.toHaveBeenCalled()
			expect(action).not.toHaveBeenCalled()
			expect(mocks.autoExtract).not.toHaveBeenCalled()
			expect(mocks.acquireLock).not.toHaveBeenCalled()
		},
	)

	it('uses the validated environment mode and lists unless explicit CLI options override them', async () => {
		await writeFile(
			path.join(directory, 'directus_settings.json'),
			JSON.stringify([{ id: 1, project_name: 'Fixture' }]),
		)
		const service = createProgram({
			SEEDER_MODE: 'INSERT-UPDATE',
			SEEDER_INCLUDE: 'directus_settings',
			SEEDER_EXCLUDE: 'directus_roles',
		})
		service.readByQuery.mockResolvedValue([{ id: 1 }])
		// Startup is a snapshot: later raw-environment changes must not trigger another parse.
		service.context.env.SEEDER_MODE = 'invalid-after-registration'
		expect(await runCommand(service.program, 'system', '--yes')).toBe(0)
		expect(service.upsertMany).toHaveBeenCalledWith([{ id: 1, project_name: 'Fixture' }])
		service.upsertMany.mockClear()
		expect(await runCommand(service.program, 'system', '--mode', 'insert-missing')).toBe(0)
		expect(service.upsertMany).not.toHaveBeenCalled()
	})

	it.each([0, -1, 1.5, NaN, Infinity, 'invalid'])(
		'rejects invalid batch size %s before registration',
		(size) => {
			expect(() => createProgram({ SEEDER_BATCH_SIZE: size })).toThrow(
				'Invalid extension options',
			)
			expect(mocks.autoExtract).not.toHaveBeenCalled()
			expect(mocks.acquireLock).not.toHaveBeenCalled()
		},
	)

	it('cleans both directories before reading, regardless of include/exclude or empty Files data', async () => {
		const assets = path.join(directory, 'assets')
		await mkdir(path.join(assets, 'nested'), { recursive: true })
		await mkdir(path.join(directory, 'nested'))
		const removed = [
			'stale.json',
			'directus_roles.json',
			'directus_settings.json',
			'assets/stale.bin',
			'assets/stale.json',
		]
		const preserved = ['notes.txt', 'nested/keep.json', 'assets/nested/keep.bin']
		for (const filename of [...removed, ...preserved])
			await writeFile(path.join(directory, filename), filename)
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		service.readByQuery.mockImplementation(async () => {
			for (const filename of removed)
				await expect(readFile(path.join(directory, filename))).rejects.toMatchObject({
					code: 'ENOENT',
				})
			return []
		})
		expect(
			await runCommand(
				service.program,
				'extract',
				'--include',
				'directus_roles',
				'directus_settings',
				'--exclude',
				'directus_settings',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.readFiles).toHaveBeenCalledOnce()
		expect(await readFile(path.join(directory, 'directus_roles.json'), 'utf8')).toBe('[]\n')
		for (const filename of preserved)
			expect(await readFile(path.join(directory, filename), 'utf8')).toBe(filename)
	})

	it('retains unrelated output with skip-clean but overwrites an empty collection with exactly [] and a newline', async () => {
		await mkdir(path.join(directory, 'assets'))
		await writeFile(path.join(directory, 'stale.json'), 'stale')
		await writeFile(path.join(directory, 'directus_roles.json'), 'stale roles')
		await writeFile(path.join(directory, 'assets', 'stale.bin'), 'bytes')
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		expect(
			await runCommand(
				service.program,
				'extract',
				'--skip-clean',
				'--include',
				'directus_roles',
			),
		).toBe(0)
		expect(await readFile(path.join(directory, 'stale.json'), 'utf8')).toBe('stale')
		expect(await readFile(path.join(directory, 'assets', 'stale.bin'), 'utf8')).toBe('bytes')
		expect(await readFile(path.join(directory, 'directus_roles.json'), 'utf8')).toBe('[]\n')
	})

	it.each([false, true])(
		'preserves every nested asset in JSON-only mode selected by environment=%s',
		async (environment) => {
			const assets = path.join(directory, 'assets')
			await mkdir(path.join(assets, 'nested'), { recursive: true })
			await writeFile(path.join(directory, 'stale.json'), 'stale')
			for (const filename of ['binary.bin', 'binary.json', 'nested/keep.json'])
				await writeFile(path.join(assets, filename), filename)
			const service = createProgram({
				DEPLOYMENT_ENV: 'development',
				SEEDER_JSON_ONLY: environment,
			})
			const records = [
				{ id: 'metadata-only', filename_disk: 'binary.json', title: 'File metadata' },
			]
			service.readByQuery.mockResolvedValue(records)
			expect(
				await runCommand(
					service.program,
					'extract',
					...(environment ? [] : ['--json-only']),
					'--include',
					'directus_files',
				),
			).toBe(0)
			await expect(readFile(path.join(directory, 'stale.json'))).rejects.toMatchObject({
				code: 'ENOENT',
			})
			for (const filename of ['binary.bin', 'binary.json', 'nested/keep.json'])
				expect(await readFile(path.join(assets, filename), 'utf8')).toBe(filename)
			expect(
				JSON.parse(await readFile(path.join(directory, 'directus_files.json'), 'utf8')),
			).toEqual(records)
			expect(service.readFiles).not.toHaveBeenCalled()
			expect(service.getAsset).not.toHaveBeenCalled()
		},
	)

	it('allows assets to override the JSON-only environment and restores binary output', async () => {
		await mkdir(path.join(directory, 'assets'))
		await writeFile(path.join(directory, 'assets', 'stale.json'), 'stale asset')
		const service = createProgram({ DEPLOYMENT_ENV: 'development', SEEDER_JSON_ONLY: true })
		service.readFiles.mockResolvedValue([{ id: 'asset', filename_disk: 'fixture.bin' }])
		service.getAsset.mockResolvedValue({ stream: Readable.from([Buffer.from([0, 255, 1])]) })
		expect(
			await runCommand(service.program, 'extract', '--assets', '--include', 'directus_roles'),
		).toBe(0)
		expect(service.getAsset).toHaveBeenCalledExactlyOnceWith('asset')
		expect(await readFile(path.join(directory, 'assets', 'fixture.bin'))).toEqual(
			Buffer.from([0, 255, 1]),
		)
		await expect(readFile(path.join(directory, 'assets', 'stale.json'))).rejects.toMatchObject({
			code: 'ENOENT',
		})
	})

	it.each([['--json-only', '--assets'], ['--assets', '--json-only'], ['--clear']])(
		'rejects invalid extraction flags %s %s before lock, read, or cleanup',
		async (...flags) => {
			const stale = path.join(directory, 'stale.json')
			await writeFile(stale, 'stale')
			const service = createProgram({ DEPLOYMENT_ENV: 'development' })
			await expect(
				service.program.parseAsync(['seed', 'extract', ...flags], { from: 'user' }),
			).rejects.toMatchObject({ exitCode: 1 })
			const message = service.writeErr.mock.calls.flat().join('')
			if (flags.includes('--clear')) expect(message).toContain("unknown option '--clear'")
			else {
				expect(message).toContain('--json-only')
				expect(message).toContain('--assets')
				expect(message).toMatch(/cannot be used|conflict/iu)
			}
			expect(mocks.acquireLock).not.toHaveBeenCalled()
			expect(service.readByQuery).not.toHaveBeenCalled()
			expect(service.readFiles).not.toHaveBeenCalled()
			expect(await readFile(stale, 'utf8')).toBe('stale')
		},
	)

	it('cleans configured external directories while preserving adjacent files', async () => {
		const seeds = path.join(directory, 'external-seeds')
		const assets = path.join(directory, 'external-assets')
		await mkdir(seeds)
		await mkdir(assets)
		await writeFile(path.join(seeds, 'stale.json'), 'stale')
		await writeFile(path.join(assets, 'stale.bin'), 'stale asset')
		await writeFile(path.join(directory, 'outside.json'), 'outside')
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_SEEDS_DIR: seeds,
			SEEDER_ASSETS_DIR: assets,
		})
		expect(await runCommand(service.program, 'extract', '--include', 'directus_roles')).toBe(0)
		expect(await readFile(path.join(seeds, 'directus_roles.json'), 'utf8')).toBe('[]\n')
		await expect(readFile(path.join(seeds, 'stale.json'))).rejects.toMatchObject({
			code: 'ENOENT',
		})
		await expect(readFile(path.join(assets, 'stale.bin'))).rejects.toMatchObject({
			code: 'ENOENT',
		})
		expect(await readFile(path.join(directory, 'outside.json'), 'utf8')).toBe('outside')
	})

	it.each([
		'equal',
		'assets-parent',
		'seed-file',
		'asset-file',
		'seed-symlink',
		'asset-symlink',
		'seed-ancestor',
		'asset-ancestor',
	])(
		'rejects %s output before deleting either directory, including JSON-only mode',
		async (invalid) => {
			const seeds = path.join(directory, 'seeds')
			const assets = path.join(directory, 'assets')
			const blocked = path.join(directory, 'blocked')
			await mkdir(seeds)
			await mkdir(assets)
			await writeFile(path.join(seeds, 'stale.json'), 'stale seeds')
			await writeFile(path.join(assets, 'stale.bin'), 'stale assets')
			if (invalid.endsWith('file')) await writeFile(blocked, 'not a directory')
			if (invalid.includes('symlink') || invalid.includes('ancestor'))
				await symlink(invalid.startsWith('seed') ? seeds : assets, blocked, 'dir')
			const selectedSeeds =
				invalid === 'assets-parent'
					? path.join(assets, 'seeds')
					: invalid.startsWith('seed-')
						? path.join(
								blocked,
								...(invalid.endsWith('ancestor') ? ['new', 'seeds'] : []),
							)
						: seeds
			const selectedAssets =
				invalid === 'equal'
					? seeds
					: invalid.startsWith('asset-')
						? path.join(
								blocked,
								...(invalid.endsWith('ancestor') ? ['new', 'assets'] : []),
							)
						: assets
			for (const jsonOnly of [false, true]) {
				const service = createProgram({
					DEPLOYMENT_ENV: 'development',
					SEEDER_SEEDS_DIR: selectedSeeds,
					SEEDER_ASSETS_DIR: selectedAssets,
					SEEDER_JSON_ONLY: jsonOnly,
				})
				expect(
					await runCommand(service.program, 'extract', '--include', 'directus_roles'),
				).toBe(1)
				expect(service.readByQuery).not.toHaveBeenCalled()
				expect(service.readFiles).not.toHaveBeenCalled()
				expect(await readFile(path.join(seeds, 'stale.json'), 'utf8')).toBe('stale seeds')
				expect(await readFile(path.join(assets, 'stale.bin'), 'utf8')).toBe('stale assets')
			}
		},
	)

	it.each(['seeds', 'assets'])(
		'rejects filesystem root as %s even with cleanup skipped and no selected collections',
		async (folder) => {
			const service = createProgram({
				DEPLOYMENT_ENV: 'development',
				[folder === 'seeds' ? 'SEEDER_SEEDS_DIR' : 'SEEDER_ASSETS_DIR']:
					path.parse(directory).root,
			})
			expect(
				await runCommand(
					service.program,
					'extract',
					'--skip-clean',
					'--include',
					'unknown_collection',
				),
			).toBe(1)
			expect(service.readByQuery).not.toHaveBeenCalled()
			expect(service.readFiles).not.toHaveBeenCalled()
		},
	)

	it('skips linked children during cleanup and preserves their outside targets', async () => {
		const seeds = path.join(directory, 'seeds')
		const assets = path.join(directory, 'assets')
		const outside = path.join(directory, 'outside.json')
		await mkdir(seeds)
		await mkdir(assets)
		await writeFile(outside, 'outside')
		await symlink(outside, path.join(seeds, 'linked.json'))
		await symlink(outside, path.join(assets, 'linked.bin'))
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_SEEDS_DIR: seeds,
			SEEDER_ASSETS_DIR: assets,
		})
		expect(await runCommand(service.program, 'extract', '--include', 'directus_roles')).toBe(0)
		expect((await lstat(path.join(seeds, 'linked.json'))).isSymbolicLink()).toBe(true)
		expect((await lstat(path.join(assets, 'linked.bin'))).isSymbolicLink()).toBe(true)
		expect(await readFile(outside, 'utf8')).toBe('outside')
	})

	it.each([
		{ kind: 'json', hardlink: false },
		{ kind: 'asset', hardlink: false },
		{ kind: 'json', hardlink: true },
		{ kind: 'asset', hardlink: true },
	])(
		'refuses writing $kind through a linked child (hardlink=$hardlink) without touching its target',
		async ({ kind, hardlink }) => {
			const seeds = path.join(directory, 'seeds')
			const assets = path.join(directory, 'assets')
			const outside = path.join(directory, 'outside')
			await mkdir(seeds)
			await mkdir(assets)
			await writeFile(outside, 'outside bytes')
			await (hardlink ? link : symlink)(
				outside,
				kind === 'json'
					? path.join(seeds, 'directus_roles.json')
					: path.join(assets, 'fixture.bin'),
			)
			const service = createProgram({
				DEPLOYMENT_ENV: 'development',
				SEEDER_SEEDS_DIR: seeds,
				SEEDER_ASSETS_DIR: assets,
			})
			service.readFiles.mockResolvedValue([{ id: 'asset', filename_disk: 'fixture.bin' }])
			service.getAsset.mockResolvedValue({
				stream: Readable.from([Buffer.from('replacement')]),
			})
			const info = vi.spyOn(logger, 'info')
			expect(
				await runCommand(
					service.program,
					'extract',
					...(hardlink ? ['--skip-clean'] : []),
					'--include',
					'directus_roles',
				),
			).toBe(1)
			expect(await readFile(outside, 'utf8')).toBe('outside bytes')
			expect(info).not.toHaveBeenCalledWith('✅ Seed data successfully extracted!')
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
		},
	)

	it.each([
		'../outside.bin',
		'/absolute.bin',
		'nested/file.bin',
		'..\\outside.bin',
		'.',
		'..',
		'bad\0file',
	])('refuses escaping or non-flat binary filenames %j', async (filename) => {
		const outside = path.join(directory, 'outside.bin')
		await writeFile(outside, 'outside')
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		service.readFiles.mockResolvedValue([{ id: 'asset', filename_disk: filename }])
		expect(await runCommand(service.program, 'extract', '--include', 'directus_roles')).toBe(1)
		expect(service.getAsset).not.toHaveBeenCalled()
		expect(await readFile(outside, 'utf8')).toBe('outside')
	})

	it.each(['database', 'json', 'files-read', 'asset-stream', 'asset-write'])(
		'exits one without overall success when extraction fails at %s',
		async (failure) => {
			const service = createProgram({ DEPLOYMENT_ENV: 'development' })
			const info = vi.spyOn(logger, 'info')
			if (failure === 'database')
				service.readByQuery.mockRejectedValue(new Error('read failed'))
			if (failure === 'json') service.readByQuery.mockResolvedValue([{ value: 1n }])
			if (failure === 'files-read')
				service.readFiles.mockRejectedValue(new Error('Files read failed'))
			if (failure === 'asset-stream') {
				service.readFiles.mockResolvedValue([{ id: 'asset', filename_disk: 'fixture.bin' }])
				service.getAsset.mockResolvedValue({
					stream: Readable.from(
						(function* () {
							yield Buffer.from('partial')
							throw new Error('asset stream failed')
						})(),
					),
				})
			}
			if (failure === 'asset-write') {
				await mkdir(path.join(directory, 'assets', 'fixture.bin'), { recursive: true })
				service.readFiles.mockResolvedValue([{ id: 'asset', filename_disk: 'fixture.bin' }])
				service.getAsset.mockResolvedValue({
					stream: Readable.from([Buffer.from('bytes')]),
				})
			}
			expect(
				await runCommand(service.program, 'extract', '--include', 'directus_roles'),
			).toBe(1)
			expect(info).not.toHaveBeenCalledWith('✅ Seed data successfully extracted!')
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
			if (failure === 'database' || failure === 'json')
				await expect(
					readFile(path.join(directory, 'directus_roles.json')),
				).rejects.toMatchObject({ code: 'ENOENT' })
		},
	)
})
