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
}))

import '../src/index'
import * as confirmations from '../src/lib/confirmationPrompts'
import { SYSTEM_COLLECTIONS } from '../src/seeders/system/config'

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
	const ItemsService = vi.fn(function (_collection: string, _options: unknown) {
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
	const getSchema = vi.fn().mockResolvedValue({})
	const database = vi.fn()
	const context: TestContext = {
		env: {
			SEEDER_SEEDS_DIR: directory,
			SEEDER_ASSETS_DIR: path.join(directory, 'assets'),
			...env,
		},
		logger,
		services: { ItemsService, FilesService, AssetsService, UtilsService },
		getSchema,
		database,
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
		deleteMany,
		ItemsService,
		FilesService,
		AssetsService,
		UtilsService,
		getSchema,
		database,
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

/**
 * Verifies preflight and empty inputs do not reach Directus services or the database.
 * @param service - Observable CLI fixture.
 * @returns Nothing.
 */
function expectNoServiceCalls(service: ReturnType<typeof createProgram>) {
	for (const spy of [
		service.ItemsService,
		service.FilesService,
		service.AssetsService,
		service.UtilsService,
		service.getSchema,
		service.database,
		service.readByQuery,
		service.readFiles,
		service.createMany,
		service.upsertMany,
		service.deleteMany,
		service.uploadOne,
		service.getAsset,
		service.clearCache,
	])
		expect(spy).not.toHaveBeenCalled()
}

describe('seeder registration and CLI', () => {
	const presets = SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_presets')
	if (!presets) throw new Error('Expected the presets collection configuration')
	const originalPresets = structuredClone(presets)

	beforeEach(async () => {
		vi.clearAllMocks()
		mocks.acquireLock.mockReturnValue({ path: 'fixture-lock', release: mocks.releaseLock })
		directory = await realpath(await mkdtemp(path.join(tmpdir(), 'seeder-cli-')))
		vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new CliExit(code)
		})
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(async () => {
		for (const key of Object.keys(presets)) Reflect.deleteProperty(presets, key)
		Object.assign(presets, structuredClone(originalPresets))
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

	it.each(['system', 'extract'])(
		'does not release a flag when %s acquisition fails',
		async (command) => {
			const service = createProgram({ DEPLOYMENT_ENV: 'development' })
			mocks.acquireLock.mockImplementationOnce(() => {
				throw new Error('Cannot acquire process lock')
			})
			expect(await runCommand(service.program, command)).toBe(1)
			expectNoServiceCalls(service)
			expect(mocks.releaseLock).not.toHaveBeenCalled()
		},
	)

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
		await writeFile(path.join(directory, 'directus_roles.json'), '[]')
		const { program, ItemsService } = createProgram()
		expect(await runCommand(program, 'system', '--mode', 'full-idempotent', '--force')).toBe(1)
		expect(ItemsService).not.toHaveBeenCalled()
		expect(mocks.acquireLock).toHaveBeenCalledOnce()
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it.each([
		{ kind: 'missing', message: 'Seed directory does not exist' },
		{ kind: 'file', message: 'Seed path is not a directory' },
	])('rejects a configured $kind seed directory with its path', async ({ kind, message }) => {
		const seeds = path.join(directory, 'configured-seeds')
		if (kind === 'file') await writeFile(seeds, 'not a directory')
		const service = createProgram({ SEEDER_SEEDS_DIR: seeds, SEEDER_MODE: 'full-idempotent' })
		const errorLog = vi.spyOn(logger, 'error')
		expect(await runCommand(service.program, 'system')).toBe(1)
		expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(`${message}: "${seeds}"`))
		expectNoServiceCalls(service)
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it.each(['insert-missing', 'insert-update', 'full-idempotent'])(
		'warns once and skips an empty seed directory without service calls in %s',
		async (mode) => {
			const service = createProgram()
			const warn = vi.spyOn(logger, 'warn')
			expect(await runCommand(service.program, 'system', '--mode', mode, '--force')).toBe(0)
			expect(warn).toHaveBeenCalledExactlyOnceWith(
				`No selected system seed files found in "${directory}"; skipping seeding`,
			)
			expectNoServiceCalls(service)
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
		},
	)

	it('ignores unsupported files and nested supported JSON even in full-idempotent mode', async () => {
		await writeFile(path.join(directory, 'unknown_collection.json'), '{broken')
		await writeFile(path.join(directory, 'notes.txt'), 'notes')
		await mkdir(path.join(directory, 'nested'))
		await writeFile(
			path.join(directory, 'nested', 'directus_roles.json'),
			JSON.stringify([{ id: 'nested-role', name: 'Nested role' }]),
		)
		const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
		const warn = vi.spyOn(logger, 'warn')
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--force'),
		).toBe(0)
		expect(warn).toHaveBeenCalledExactlyOnceWith(
			`No selected system seed files found in "${directory}"; skipping seeding`,
		)
		expectNoServiceCalls(service)
	})

	it('seeds a sparse dataset in full-idempotent mode without treating missing files as empty data', async () => {
		const roles = [{ id: 'new-role', name: 'New role' }]
		await writeFile(path.join(directory, 'directus_roles.json'), JSON.stringify(roles))
		const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
		const warn = vi.spyOn(logger, 'warn')
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--force'),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.FilesService).not.toHaveBeenCalled()
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(roles)
		expect(warn).not.toHaveBeenCalled()
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
	})

	it('applies collection modes, global fallback, explicit mode override and JSON processing order', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					order: ['directus_presets', 'directus_roles'],
					collections: { directus_presets: { operationMode: 'insert-update' } },
				},
			}),
		)
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		await writeFile(path.join(directory, 'directus_presets.json'), '[{"id":1}]')
		const service = createProgram({ SEEDER_CONFIG_PATH: configPath })
		expect(
			await runCommand(
				service.program,
				'system',
				'--yes',
				'--include',
				'directus_roles',
				'directus_presets',
			),
		).toBe(0)
		expect(service.ItemsService.mock.calls.map(([name]) => name)).toEqual([
			'directus_presets',
			'directus_roles',
		])
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith([{ id: 1 }])
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([{ id: 'role' }])
		service.upsertMany.mockClear()
		expect(
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-missing',
				'--include',
				'directus_presets',
			),
		).toBe(0)
		expect(service.upsertMany).not.toHaveBeenCalled()
	})

	it('requires opt-in and the strongest selected confirmation for collection-level full-idempotent', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_roles: { operationMode: 'insert-update' },
						directus_presets: {
							operationMode: 'full-idempotent',
							management: { type: 'id-range', max: 50000 },
						},
					},
				},
			}),
		)
		await writeFile(path.join(directory, 'directus_roles.json'), '[]')
		await writeFile(path.join(directory, 'directus_presets.json'), '[]')
		const disabled = createProgram({ SEEDER_CONFIG_PATH: configPath })
		expect(await runCommand(disabled.program, 'system', '--yes')).toBe(1)
		expectNoServiceCalls(disabled)
		// Explicit CLI mode removes the destructive mode but retains the range.
		expect(await runCommand(disabled.program, 'system', '--mode', 'insert-missing')).toBe(0)
		const service = createProgram({
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_ENABLE_FULL_IDEMPOTENT: true,
		})
		const skip = vi.spyOn(confirmations, 'shouldSkipConfirmation').mockReturnValue(false)
		const explicit = vi.spyOn(confirmations, 'confirmExplicit').mockResolvedValue(false)
		const yesNo = vi.spyOn(confirmations, 'confirmYesNo').mockResolvedValue(false)
		expect(await runCommand(service.program, 'system')).toBe(0)
		expect(explicit).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining('full-idempotent'),
			'DELETE',
			logger,
		)
		expect(yesNo).not.toHaveBeenCalled()
		expectNoServiceCalls(service)
		explicit.mockClear()
		expect(await runCommand(service.program, 'system', '--exclude', 'directus_presets')).toBe(0)
		expect(explicit).not.toHaveBeenCalled()
		expect(yesNo).toHaveBeenCalledOnce()
		skip.mockRestore()
		explicit.mockRestore()
		yesNo.mockRestore()
	})

	it('skips destructive guards for missing seed files while processing present selected collections', async () => {
		presets.operationMode = 'full-idempotent'
		const roles = [{ id: 'role', name: 'Role' }]
		await writeFile(path.join(directory, 'directus_roles.json'), JSON.stringify(roles))
		const service = createProgram()
		vi.spyOn(confirmations, 'shouldSkipConfirmation').mockReturnValue(false)
		const explicit = vi.spyOn(confirmations, 'confirmExplicit').mockResolvedValue(false)
		const yesNo = vi.spyOn(confirmations, 'confirmYesNo').mockResolvedValue(false)
		expect(await runCommand(service.program, 'system')).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith(roles)
		// Explicit full-idempotent also requires no opt-in when its only selected file is missing.
		expect(
			await runCommand(
				service.program,
				'system',
				'--mode',
				'full-idempotent',
				'--include',
				'directus_presets',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledOnce()
		expect(service.upsertMany).not.toHaveBeenCalled()
		expect(service.deleteMany).not.toHaveBeenCalled()
		expect(explicit).not.toHaveBeenCalled()
		expect(yesNo).not.toHaveBeenCalled()
	})

	it('preflights every present managed collection under its effective mode before earlier inserts', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_presets: {
							operationMode: 'full-idempotent',
							management: { type: 'id-range', min: 10, max: 20 },
						},
					},
				},
			}),
		)
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		await writeFile(path.join(directory, 'directus_presets.json'), '[{"id":20}]')
		const service = createProgram({
			SEEDER_CONFIG_PATH: configPath,
			SEEDER_ENABLE_FULL_IDEMPOTENT: true,
			SEEDER_CONTINUE_ON_ERROR: true,
		})
		expect(await runCommand(service.program, 'system', '--yes')).toBe(1)
		expectNoServiceCalls(service)
		// Selection still controls which present seed files are preflighted.
		expect(
			await runCommand(service.program, 'system', '--yes', '--exclude', 'directus_presets'),
		).toBe(0)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([{ id: 'role' }])
	})

	it('combines the complete range and extraction filter while retaining other preset defaults', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					collections: {
						directus_presets: { management: { type: 'id-range', min: 10, max: 20 } },
					},
				},
			}),
		)
		const service = createProgram({
			SEEDER_CONFIG_PATH: configPath,
			DEPLOYMENT_ENV: 'development',
			SEEDER_JSON_ONLY: true,
		})
		expect(await runCommand(service.program, 'extract', '--include', 'directus_presets')).toBe(
			0,
		)
		expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
			limit: -1,
			fields: originalPresets.fields,
			sort: originalPresets.sort,
			deep: null,
			filter: {
				_and: [{ user: { _null: true } }, { id: { _gte: 10 } }, { id: { _lt: 20 } }],
			},
		})
	})

	it('passes JSON query replacements to extraction without merging nested values', async () => {
		const configPath = path.join(directory, 'consumer.json')
		const query = {
			fields: ['id', 'role.name'],
			sort: ['id'],
			filter: { id: { _gte: 2 } },
			deep: { role: { _filter: { name: { _eq: 'Editor' } }, _limit: 1 } },
		}
		await writeFile(
			configPath,
			JSON.stringify({ system: { collections: { directus_presets: query } } }),
		)
		const service = createProgram({
			SEEDER_CONFIG_PATH: configPath,
			DEPLOYMENT_ENV: 'development',
			SEEDER_JSON_ONLY: true,
		})
		expect(await runCommand(service.program, 'extract', '--include', 'directus_presets')).toBe(
			0,
		)
		expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({ limit: -1, ...query })
	})

	it('fails invalid effective configuration before database calls or destructive extraction cleanup', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: { collections: { directus_presets: { management: { type: 'id-range' } } } },
			}),
		)
		const stale = path.join(directory, 'stale.json')
		await writeFile(stale, 'keep')
		for (const command of ['system', 'extract']) {
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				DEPLOYMENT_ENV: 'development',
			})
			expect(await runCommand(service.program, command)).toBe(1)
			expectNoServiceCalls(service)
			expect(await readFile(stale, 'utf8')).toBe('keep')
			expect(await readFile(configPath, 'utf8')).toContain('id-range')
		}
	})

	it('rejects out-of-range seeds in preflight before earlier collections mutate, even with continue-on-error', async () => {
		presets.management = { type: 'id-range', max: 50000 }
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		await writeFile(path.join(directory, 'directus_presets.json'), '[{"id":50000}]')
		const service = createProgram({
			SEEDER_ENABLE_FULL_IDEMPOTENT: true,
			SEEDER_CONTINUE_ON_ERROR: true,
		})
		const errorLog = vi.spyOn(logger, 'error')
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--yes'),
		).toBe(1)
		expect(errorLog).toHaveBeenCalledWith(
			expect.stringContaining(
				'collection "directus_presets" has ID 50000 outside managed ID range',
			),
		)
		expectNoServiceCalls(service)
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it('keeps configured management when CLI overrides the mode and deletes only obsolete managed IDs', async () => {
		presets.management = { type: 'id-range', max: 50000 }
		const seeds = [{ id: 1, bookmark: 'Restored' }]
		await writeFile(path.join(directory, 'directus_presets.json'), JSON.stringify(seeds))
		const service = createProgram({
			SEEDER_MODE: 'insert-missing',
			SEEDER_ENABLE_FULL_IDEMPOTENT: true,
		})
		service.readByQuery.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([{ id: 2 }])
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--yes'),
		).toBe(0)
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(seeds)
		expect(service.readByQuery).toHaveBeenLastCalledWith({
			fields: ['id'],
			filter: { _and: [{ id: { _lt: 50000 } }, { id: { _nin: [1] } }] },
			limit: -1,
		})
		expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([2])
	})

	it('limits empty seed deletion to the range and skips the collection when its file is missing', async () => {
		presets.management = { type: 'id-range', max: 50000 }
		const filename = path.join(directory, 'directus_presets.json')
		await writeFile(filename, '[]')
		const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
		service.readByQuery.mockResolvedValue([{ id: 2 }])
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--yes'),
		).toBe(0)
		expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
			fields: ['id'],
			filter: { _and: [{ id: { _lt: 50000 } }] },
			limit: -1,
		})
		expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([2])
		await rm(filename)
		await writeFile(path.join(directory, 'directus_roles.json'), '[]')
		service.ItemsService.mockClear()
		service.readByQuery.mockClear().mockResolvedValue([])
		service.deleteMany.mockClear()
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--yes'),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.deleteMany).not.toHaveBeenCalled()
	})

	it.each(['insert-missing', 'insert-update'])(
		'keeps %s unchanged for seed IDs outside configured management',
		async (mode) => {
			presets.management = { type: 'id-range', max: 50000 }
			const seeds = [{ id: 50001 }]
			await writeFile(path.join(directory, 'directus_presets.json'), JSON.stringify(seeds))
			const service = createProgram()
			expect(await runCommand(service.program, 'system', '--mode', mode, '--yes')).toBe(0)
			expect(
				mode === 'insert-missing' ? service.createMany : service.upsertMany,
			).toHaveBeenCalledExactlyOnceWith(seeds)
			expect(service.deleteMany).not.toHaveBeenCalled()
		},
	)

	it.each(['insert-missing', 'insert-update', 'full-idempotent'])(
		'treats [] as intentional empty data in %s, retaining guarded deletion',
		async (mode) => {
			await writeFile(path.join(directory, 'directus_roles.json'), '[]')
			const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
			const warn = vi.spyOn(logger, 'warn')
			service.readByQuery.mockResolvedValue([{ id: 'existing' }])
			expect(await runCommand(service.program, 'system', '--mode', mode, '--yes')).toBe(0)
			expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
				'directus_roles',
				expect.any(Object),
			)
			expect(service.createMany).not.toHaveBeenCalled()
			expect(service.upsertMany).not.toHaveBeenCalled()
			if (mode === 'full-idempotent') {
				expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
					fields: ['id'],
					filter: { id: { _nin: [] } },
					limit: -1,
				})
				expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith(['existing'])
			} else {
				expect(service.readByQuery).not.toHaveBeenCalled()
				expect(service.deleteMany).not.toHaveBeenCalled()
			}
			expect(warn).not.toHaveBeenCalled()
			expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
		},
	)

	it.each([
		{
			selection: 'environment include',
			env: { SEEDER_INCLUDE: 'directus_roles' },
			flags: [],
		},
		{
			selection: 'environment exclude',
			env: { SEEDER_EXCLUDE: 'directus_permissions' },
			flags: [],
		},
		{
			selection: 'CLI include overrides environment include',
			env: { SEEDER_INCLUDE: 'directus_permissions' },
			flags: ['--include', 'directus_roles'],
		},
		{
			selection: 'CLI exclude overrides environment exclude',
			env: {
				SEEDER_INCLUDE: ['directus_roles', 'directus_permissions'],
				SEEDER_EXCLUDE: 'directus_roles',
			},
			flags: ['--exclude', 'directus_permissions'],
		},
		{
			selection: 'environment exclude wins over CLI include',
			env: { SEEDER_EXCLUDE: 'directus_permissions' },
			flags: ['--include', 'directus_roles', 'directus_permissions'],
		},
		{
			selection: 'CLI exclude wins over environment include',
			env: { SEEDER_INCLUDE: ['directus_roles', 'directus_permissions'] },
			flags: ['--exclude', 'directus_permissions'],
		},
	])(
		'ignores invalid unused input with $selection, even with continue-on-error',
		async ({ env, flags }) => {
			const roles = [{ id: 'role', name: 'Role' }]
			await writeFile(path.join(directory, 'directus_roles.json'), JSON.stringify(roles))
			await writeFile(path.join(directory, 'directus_permissions.json'), '{broken')
			const service = createProgram({
				DEPLOYMENT_ENV: 'production',
				...env,
				SEEDER_CONTINUE_ON_ERROR: true,
			})
			const warn = vi.spyOn(logger, 'warn')
			const error = vi.spyOn(logger, 'error')
			expect(await runCommand(service.program, 'system', ...flags)).toBe(0)
			expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
				'directus_roles',
				expect.any(Object),
			)
			expect(service.createMany).toHaveBeenCalledExactlyOnceWith(roles)
			expect(service.FilesService).not.toHaveBeenCalled()
			expect(warn).not.toHaveBeenCalled()
			expect(error).not.toHaveBeenCalled()
		},
	)

	it('ignores invalid Flow input when only Roles are selected in production', async () => {
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		await writeFile(path.join(directory, 'directus_flows.json'), '{broken')
		const service = createProgram({ DEPLOYMENT_ENV: 'production' })
		const error = vi.spyOn(logger, 'error')
		expect(await runCommand(service.program, 'system', '--include', 'directus_roles')).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([{ id: 'role' }])
		expect(error).not.toHaveBeenCalled()
	})

	it('ignores an unreadable unselected file without a warning', async () => {
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		await mkdir(path.join(directory, 'directus_permissions.json'))
		const service = createProgram()
		const warn = vi.spyOn(logger, 'warn')
		expect(
			await runCommand(service.program, 'system', '--exclude', 'directus_permissions'),
		).toBe(0)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([{ id: 'role' }])
		expect(warn).not.toHaveBeenCalled()
	})

	it('skips services and cache clearing without selected files but processes an explicit empty seed file', async () => {
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
		expect(await runCommand(service.program, 'system', '--include', 'directus_presets')).toBe(0)
		expectNoServiceCalls(service)
		expect(
			await runCommand(
				service.program,
				'system',
				'--include',
				'directus_roles',
				'--exclude',
				'directus_roles',
			),
		).toBe(0)
		expectNoServiceCalls(service)

		await writeFile(path.join(directory, 'directus_presets.json'), '[]')
		service.readByQuery.mockResolvedValue([{ id: 7 }])
		expect(
			await runCommand(
				service.program,
				'system',
				'--include',
				'directus_presets',
				'--mode',
				'full-idempotent',
				'--yes',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_presets',
			expect.any(Object),
		)
		expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([7])
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
	})

	it.each(
		[false, true].flatMap((continueOnError) =>
			['syntax', 'non-array', 'empty', 'read', 'transform'].map((failure) => ({
				continueOnError,
				failure,
			})),
		),
	)(
		'exits one before collection operations on $failure with continue-on-error=$continueOnError',
		async ({ continueOnError, failure }) => {
			await writeFile(
				path.join(directory, 'directus_roles.json'),
				JSON.stringify([{ id: 'new-role', name: 'New role' }]),
			)
			const filename = path.join(directory, 'directus_permissions.json')
			if (failure === 'read') await mkdir(filename)
			else {
				await writeFile(
					filename,
					failure === 'syntax' ? '{broken' : failure === 'empty' ? '' : '{}',
				)
			}
			if (failure === 'transform') {
				await writeFile(filename, '[]')
				await writeFile(path.join(directory, 'directus_users.json'), '[null]')
			}
			const service = createProgram({
				SEEDER_CONTINUE_ON_ERROR: continueOnError,
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
			})
			const errorLog = vi.spyOn(logger, 'error')
			expect(
				await runCommand(
					service.program,
					'system',
					'--mode',
					'full-idempotent',
					'--yes',
					'--include',
					'directus_roles',
					'directus_users',
					'directus_permissions',
				),
			).toBe(1)
			if (failure !== 'transform')
				expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(filename))
			expectNoServiceCalls(service)
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
		},
	)

	it.each([undefined, 'Development', 'development'])(
		'uses unselected Flow metadata for operations-only filtering in %s',
		async (DEPLOYMENT_ENV) => {
			await writeFile(
				path.join(directory, 'directus_flows.json'),
				JSON.stringify([
					{ id: 'live', name: 'Live' },
					{ id: 'dev', name: 'A [dEv] helper' },
				]),
			)
			const liveOperation = {
				id: 'live-op',
				key: 'live',
				flow: 'live',
				resolve: null,
				reject: null,
			}
			const devOperation = { ...liveOperation, id: 'dev-op', key: 'dev', flow: 'dev' }
			await writeFile(
				path.join(directory, 'directus_operations.json'),
				JSON.stringify([liveOperation, devOperation]),
			)
			const service = createProgram({ DEPLOYMENT_ENV })
			expect(
				await runCommand(
					service.program,
					'system',
					'--include',
					'directus_operations',
					'--exclude',
					'directus_flows',
				),
			).toBe(0)
			expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
				'directus_operations',
				expect.any(Object),
			)
			expect(service.createMany).toHaveBeenCalledExactlyOnceWith(
				DEPLOYMENT_ENV === 'development' ? [liveOperation, devOperation] : [liveOperation],
			)
			expect(service.upsertMany).not.toHaveBeenCalled()
			expect(service.deleteMany).not.toHaveBeenCalled()
			expect(service.FilesService).not.toHaveBeenCalled()
		},
	)

	it.each(['syntax', 'non-array', 'read', 'transform'])(
		'rejects invalid unselected Flow metadata (%s) needed for production operation filtering',
		async (failure) => {
			const filename = path.join(directory, 'directus_flows.json')
			if (failure === 'read') await mkdir(filename)
			else
				await writeFile(
					filename,
					failure === 'syntax' ? '{broken' : failure === 'non-array' ? '{}' : '[null]',
				)
			await writeFile(
				path.join(directory, 'directus_operations.json'),
				JSON.stringify([{ id: 'live-op', key: 'live', flow: 'live' }]),
			)
			const service = createProgram({
				DEPLOYMENT_ENV: 'production',
				SEEDER_CONTINUE_ON_ERROR: true,
			})
			const errorLog = vi.spyOn(logger, 'error')
			expect(
				await runCommand(
					service.program,
					'system',
					'--include',
					'directus_operations',
					'--exclude',
					'directus_flows',
				),
			).toBe(1)
			if (failure !== 'transform')
				expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(filename))
			expectNoServiceCalls(service)
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
		},
	)

	it('does not read unselected Flow metadata for operations in exact development', async () => {
		await writeFile(path.join(directory, 'directus_flows.json'), '{broken')
		const operation = { id: 'live-op', key: 'live', flow: 'live', resolve: null, reject: null }
		await writeFile(
			path.join(directory, 'directus_operations.json'),
			JSON.stringify([operation]),
		)
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_CONTINUE_ON_ERROR: true,
		})
		const errorLog = vi.spyOn(logger, 'error')
		expect(
			await runCommand(
				service.program,
				'system',
				'--include',
				'directus_operations',
				'--exclude',
				'directus_flows',
			),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_operations',
			expect.any(Object),
		)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([operation])
		expect(errorLog).not.toHaveBeenCalled()
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it.each(['production', 'development'])(
		'rejects selected invalid Flow input in %s even with continue-on-error',
		async (DEPLOYMENT_ENV) => {
			await writeFile(path.join(directory, 'directus_flows.json'), '{broken')
			const service = createProgram({ DEPLOYMENT_ENV, SEEDER_CONTINUE_ON_ERROR: true })
			expect(await runCommand(service.program, 'system', '--include', 'directus_flows')).toBe(
				1,
			)
			expectNoServiceCalls(service)
		},
	)

	it('imports operations without Flow filtering when the Flow metadata file is missing', async () => {
		const operation = { id: 'op', key: 'dev', flow: 'dev', resolve: null, reject: null }
		await writeFile(
			path.join(directory, 'directus_operations.json'),
			JSON.stringify([operation]),
		)
		const service = createProgram({ DEPLOYMENT_ENV: 'production' })
		expect(
			await runCommand(service.program, 'system', '--include', 'directus_operations'),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_operations',
			expect.any(Object),
		)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith([operation])
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

	it('exits one on a mutation failure by default, stopping later batches and collections', async () => {
		const roles = [{ id: 'created' }, { id: 'failed' }, { id: 'unreached' }]
		await writeFile(path.join(directory, 'directus_roles.json'), JSON.stringify(roles))
		await writeFile(path.join(directory, 'directus_settings.json'), '[{"id":1}]')
		const service = createProgram({ SEEDER_BATCH_SIZE: 1 })
		service.createMany
			.mockResolvedValueOnce(['created'])
			.mockRejectedValueOnce(new Error('mutation failed'))
		const errorLog = vi.spyOn(logger, 'error')
		const info = vi.spyOn(logger, 'info')
		expect(await runCommand(service.program, 'system')).toBe(1)
		expect(service.createMany.mock.calls).toEqual([[[roles[0]]], [[roles[1]]]])
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(errorLog.mock.calls).toEqual([
			['Error seeding collection directus_roles: mutation failed'],
			['❌ System data seeding failed; see collection errors above'],
		])
		expect(info).not.toHaveBeenCalledWith(expect.stringContaining('Seeded directus_roles:'))
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
	})

	it('exits one after a continuing mutation error, clearing cache and seeding later collections', async () => {
		const roles = [{ id: 'role', name: 'Role' }]
		const settings = [{ id: 1, project_name: 'Fixture' }]
		await writeFile(path.join(directory, 'directus_roles.json'), JSON.stringify(roles))
		await writeFile(path.join(directory, 'directus_settings.json'), JSON.stringify(settings))
		const service = createProgram({ SEEDER_CONTINUE_ON_ERROR: true })
		service.createMany.mockRejectedValueOnce(new Error('mutation failed'))
		const errorLog = vi.spyOn(logger, 'error')
		expect(await runCommand(service.program, 'system')).toBe(1)
		expect(service.createMany.mock.calls).toEqual([[roles], [settings]])
		expect(errorLog).toHaveBeenCalledWith(
			'Error seeding collection directus_roles: mutation failed',
		)
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
	})

	it('retains a collection setup error when continuing to the next collection', async () => {
		await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
		const settings = [{ id: 1, project_name: 'Fixture' }]
		await writeFile(path.join(directory, 'directus_settings.json'), JSON.stringify(settings))
		const service = createProgram({ SEEDER_CONTINUE_ON_ERROR: true })
		service.getSchema.mockRejectedValueOnce(new Error('schema unavailable'))
		const errorLog = vi.spyOn(logger, 'error')
		expect(await runCommand(service.program, 'system')).toBe(1)
		expect(service.createMany).toHaveBeenCalledExactlyOnceWith(settings)
		expect(errorLog).toHaveBeenCalledWith(
			'Error seeding collection directus_roles: schema unavailable',
		)
	})

	it('stops a partially failed asset batch but continues later collections with exit one', async () => {
		await mkdir(path.join(directory, 'assets'))
		await writeFile(path.join(directory, 'assets', 'fixture.bin'), 'asset')
		const files = ['uploaded', 'failed', 'unreached'].map((id) => ({
			id,
			filename_disk: 'fixture.bin',
		}))
		await writeFile(path.join(directory, 'directus_files.json'), JSON.stringify(files))
		const settings = [{ id: 1 }]
		await writeFile(path.join(directory, 'directus_settings.json'), JSON.stringify(settings))
		const service = createProgram({ SEEDER_CONTINUE_ON_ERROR: true })
		service.uploadOne.mockImplementation(async (stream, _data, id) => {
			await stream.toArray()
			if (id === 'failed') throw new Error('storage unavailable')
			return 'uploaded'
		})
		const errorLog = vi.spyOn(logger, 'error')
		expect(
			await runCommand(service.program, 'system', '--mode', 'insert-update', '--yes'),
		).toBe(1)
		expect(service.uploadOne.mock.calls.map(([, , id]) => id)).toEqual(['uploaded', 'failed'])
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(settings)
		expect(errorLog).toHaveBeenCalledWith(
			'Error seeding collection directus_files: storage unavailable',
		)
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
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
		{ style: 'space', size: 4, indent: 4 },
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
	})

	it('rejects invalid indentation at startup before registration', () => {
		const info = vi.spyOn(logger, 'info')
		const init = vi.fn<Init>()
		const action = vi.fn()
		expect(() =>
			mocks.register(
				{ init, action },
				{
					env: { DEPLOYMENT_ENV: 'development', SEEDER_JSON_INDENT: 'invalid' },
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
	})

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

	it('lets CLI selection override environment lists, excludes included collections, and preserves dependency order', async () => {
		for (const collection of [
			'directus_settings',
			'directus_roles',
			'directus_permissions',
			'directus_policies',
			'directus_translations',
		])
			await writeFile(path.join(directory, `${collection}.json`), '[]')
		const service = createProgram({
			SEEDER_INCLUDE: ['directus_translations'],
			SEEDER_EXCLUDE: ['directus_policies', 'directus_settings'],
		})
		expect(
			await runCommand(
				service.program,
				'system',
				'--include',
				'directus_settings',
				'directus_roles',
				'directus_permissions',
				'directus_policies',
				'--exclude',
				'directus_permissions',
			),
		).toBe(0)
		expect(service.ItemsService.mock.calls.map(([collection]) => collection)).toEqual([
			'directus_policies',
			'directus_roles',
			'directus_settings',
		])
	})

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
