import type { Logger } from 'pino'

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
			SEEDER_SEEDS_FOLDER: directory,
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
	const program = new Command().exitOverride().configureOutput({ writeErr: vi.fn() })
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
		directory = await mkdtemp(path.join(tmpdir(), 'seeder-cli-'))
		vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new CliExit(code)
		})
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	it('registers seed system and development extraction with the original environment defaults', () => {
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

	it('honors environment extraction flags and allows explicit CLI flags and lists to override them', async () => {
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_INCLUDE: 'directus_roles',
			SEEDER_EXTRACT_ASSETS: false,
		})
		const stale = path.join(directory, 'stale.json')
		await writeFile(stale, 'stale')
		expect(await runCommand(service.program, 'extract')).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledWith('directus_roles', expect.any(Object))
		expect(service.readFiles).not.toHaveBeenCalled()
		expect(await readFile(stale, 'utf8')).toBe('stale')
		service.ItemsService.mockClear()
		expect(
			await runCommand(
				service.program,
				'extract',
				'--assets',
				'--clear',
				'--include',
				'directus_settings',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_settings',
			expect.any(Object),
		)
		expect(service.readFiles).toHaveBeenCalledOnce()
		await expect(readFile(stale)).rejects.toMatchObject({ code: 'ENOENT' })
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

	it('leaves stale output for an empty collection unless clear is explicitly requested', async () => {
		const filename = path.join(directory, 'directus_roles.json')
		await writeFile(filename, 'stale')
		expect(
			await runCommand(
				createProgram({ DEPLOYMENT_ENV: 'development' }).program,
				'extract',
				'--include',
				'directus_roles',
			),
		).toBe(0)
		expect(await readFile(filename, 'utf8')).toBe('stale')
		expect(
			await runCommand(
				createProgram({ DEPLOYMENT_ENV: 'development' }).program,
				'extract',
				'--clear',
				'--include',
				'directus_roles',
			),
		).toBe(0)
		await expect(readFile(filename, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
	})
})
