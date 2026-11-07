import type { SchemaOverview } from '@directus/types'
import type { Logger } from 'pino'

import {
	link,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
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
let seedRoot = ''

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
	const getSchema = vi.fn().mockResolvedValue({
		collections: Object.fromEntries(
			SYSTEM_COLLECTIONS.map(({ collection }) => [
				collection,
				{ primary: 'id', fields: { id: { type: 'string' } } },
			]),
		),
	})
	const database = vi.fn()
	const context: TestContext = {
		env: {
			SEEDER_SEEDS_DIR: seedRoot,
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

/**
 * Models a direct scalar permissions.policy relation with the live schema's structural fields.
 * @param keyType - Source key type; UUID keys use the string foreign key observed in Directus 12.2.
 * @returns A schema fixture checked against the installed Directus contract.
 */
function relationSchema(keyType: 'uuid' | 'string' | 'integer' = 'uuid') {
	const field = (name: string, type: 'uuid' | 'string' | 'integer') => ({
		field: name,
		type,
		defaultValue: null,
		nullable: false,
		generated: false,
		dbType: null,
		precision: null,
		scale: null,
		special: [],
		note: null,
		validation: null,
		alias: false,
		searchable: true,
	})
	return {
		collections: {
			directus_permissions: {
				collection: 'directus_permissions',
				primary: 'id',
				singleton: false,
				sortField: null,
				note: null,
				accountability: null,
				fields: {
					id: field('id', 'integer'),
					policy: field('policy', keyType === 'uuid' ? 'string' : keyType),
				},
			},
			directus_policies: {
				collection: 'directus_policies',
				primary: 'id',
				singleton: false,
				sortField: null,
				note: null,
				accountability: null,
				fields: { id: field('id', keyType) },
			},
		},
		relations: [
			{
				collection: 'directus_permissions',
				field: 'policy',
				related_collection: 'directus_policies',
				meta: null,
				schema: {
					table: 'directus_permissions',
					column: 'policy',
					foreign_key_table: 'directus_policies',
					foreign_key_column: 'id',
					constraint_name: null,
					on_update: null,
					on_delete: null,
				},
			},
		],
	} satisfies SchemaOverview
}

describe('seeder registration and CLI', () => {
	const presets = SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_presets')
	if (!presets) throw new Error('Expected the presets collection configuration')
	const originalPresets = structuredClone(presets)

	beforeEach(async () => {
		vi.clearAllMocks()
		mocks.acquireLock.mockReturnValue({ path: 'fixture-lock', release: mocks.releaseLock })
		seedRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'seeder-cli-')))
		directory = path.join(seedRoot, 'system')
		await mkdir(directory)
		vi.spyOn(process, 'exit').mockImplementation((code) => {
			throw new CliExit(code)
		})
		vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	})

	afterEach(async () => {
		for (const key of Object.keys(presets)) Reflect.deleteProperty(presets, key)
		Object.assign(presets, structuredClone(originalPresets))
		await rm(seedRoot, { recursive: true, force: true })
	})

	it('registers seed system and development extraction with the validated environment defaults', () => {
		const { program, action } = createProgram({ DEPLOYMENT_ENV: 'development' })
		expect(program.commands.map((command) => command.name())).toEqual(['seed'])
		expect(program.commands[0]?.commands.map((command) => command.name())).toEqual([
			'system',
			'config',
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
			).toEqual(['system', 'config'])
		}
		expect(mocks.autoExtract).not.toHaveBeenCalled()
	})

	describe('read-only config inspection', () => {
		const originalArgv = process.argv
		beforeEach(() => {
			process.argv = ['node', '/directus/cli.js', 'seed', 'config']
		})
		afterEach(() => {
			process.argv = originalArgv
		})

		/**
		 * Captures the JSON stream while allowing the command to await its flush.
		 * @returns Captured output chunks.
		 */
		function captureOutput() {
			const chunks: string[] = []
			vi.spyOn(process.stdout, 'write').mockImplementation((chunk, _encoding, callback) => {
				chunks.push(String(chunk))
				callback?.()
				return true
			})
			return chunks
		}

		it('shows built-in collection settings and modes without seed input, services, secrets or writes', async () => {
			const missingSeeds = path.join(directory, 'missing-seeds')
			const service = createProgram({
				SEEDER_SEEDS_DIR: missingSeeds,
				SEEDER_INCLUDE: ['directus_presets'],
				SEEDER_EXCLUDE: ['directus_roles'],
				DEFAULT_PASSWORD: 'inspection-must-not-expose-this',
			})
			const output = captureOutput()
			expect(await runCommand(service.program, 'config')).toBe(0)
			expect(JSON.parse(output.join(''))).toEqual({
				system: {
					order: SYSTEM_COLLECTIONS.map(({ collection }) => collection),
					collections: Object.fromEntries(
						SYSTEM_COLLECTIONS.map(({ collection, ...settings }) => [
							collection,
							settings,
						]),
					),
				},
			})
			expect(output.join('')).toMatch(/^\{\n  "system":/u)
			expect(output.join('')).toMatch(/\n$/u)
			expect(await readdir(directory)).toEqual([])
			expectNoServiceCalls(service)
			expect(mocks.acquireLock).not.toHaveBeenCalled()
		})

		it('shows shallow consumer overrides, resolved order and inherited collection modes without opt-in', async () => {
			const configPath = path.join(directory, 'consumer.json')
			await writeFile(
				configPath,
				JSON.stringify({
					$comment: 'Only overrides, never exported as runtime settings',
					system: {
						order: ['directus_presets'],
						collections: {
							directus_roles: { management: null },
							directus_permissions: {
								management: {
									type: 'relation',
									field: 'policy',
									collection: 'directus_policies',
								},
							},
							directus_presets: {
								operationMode: 'full-idempotent',
								fields: ['id'],
								management: { type: 'id-range', max: 50000 },
							},
						},
					},
				}),
			)
			const contents = await readFile(configPath, 'utf8')
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				DEPLOYMENT_ENV: 'development',
				SEEDER_AUTO_EXTRACT: true,
			})
			const output = captureOutput()
			expect(await runCommand(service.program, 'config')).toBe(0)
			expect(JSON.parse(output.join(''))).toMatchObject({
				system: {
					order: [
						'directus_presets',
						...SYSTEM_COLLECTIONS.map(({ collection }) => collection).filter(
							(name) => name !== 'directus_presets',
						),
					],
					collections: {
						directus_permissions: {
							management: {
								type: 'relation',
								field: 'policy',
								collection: 'directus_policies',
							},
						},
						directus_presets: {
							operationMode: 'full-idempotent',
							fields: ['id'],
							filter: { user: { _null: true } },
							sort: ['-role', 'id'],
							management: { type: 'id-range', max: 50000 },
						},
						directus_roles: { operationMode: 'full-idempotent' },
					},
				},
			})
			expect(JSON.parse(output.join(''))).not.toHaveProperty(
				'system.collections.directus_roles.management',
			)
			expect(output.join('')).not.toContain('$comment')
			expect(await readFile(configPath, 'utf8')).toBe(contents)
			expect(await readdir(directory)).toEqual(['consumer.json'])
			expectNoServiceCalls(service)
			expect(mocks.acquireLock).not.toHaveBeenCalled()
			expect(mocks.autoExtract).not.toHaveBeenCalled()
		})

		it('selects one collection and bypasses missing or invalid consumer files for defaults', async () => {
			const configPath = path.join(directory, 'consumer.json')
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				DEPLOYMENT_ENV: 'development',
				SEEDER_AUTO_EXTRACT: true,
			})
			const roles = SYSTEM_COLLECTIONS.find(
				({ collection }) => collection === 'directus_roles',
			)
			const { collection: _collection, ...settings } = roles ?? {}
			const output = captureOutput()
			for (const contents of [
				undefined,
				'{broken',
				'{"system":{"collections":{"unknown":{}}}}',
				'{"system":{"collections":{"directus_roles":{"management":null}}}}',
			]) {
				if (contents !== undefined) await writeFile(configPath, contents)
				output.length = 0
				expect(
					await runCommand(
						service.program,
						'config',
						'--defaults',
						'--collection',
						'directus_roles',
					),
				).toBe(0)
				expect(JSON.parse(output.join(''))).toEqual({
					system: {
						order: ['directus_roles'],
						collections: {
							directus_roles: settings,
						},
					},
				})
			}
			await rm(configPath)
			output.length = 0
			expect(await runCommand(service.program, 'config', '--defaults')).toBe(0)
			expect(JSON.parse(output.join(''))).toMatchObject({
				system: { order: SYSTEM_COLLECTIONS.map(({ collection }) => collection) },
			})
			expectNoServiceCalls(service)
			expect(mocks.acquireLock).not.toHaveBeenCalled()
			expect(mocks.autoExtract).not.toHaveBeenCalled()
		})

		it('preserves automatic-hook registration unless both CLI tokens identify seed config', () => {
			for (const args of [
				['seed', 'system'],
				['other', 'config'],
			]) {
				process.argv = ['node', '/directus/cli.js', ...args]
				createProgram({ DEPLOYMENT_ENV: 'development', SEEDER_AUTO_EXTRACT: true })
			}
			expect(mocks.autoExtract).toHaveBeenCalledTimes(2)
		})

		it('shows one effective collection and rejects unknown names and invalid consumer files with exit 1', async () => {
			const service = createProgram()
			const output = captureOutput()
			expect(
				await runCommand(service.program, 'config', '--collection', 'directus_roles'),
			).toBe(0)
			expect(JSON.parse(output.join(''))).toMatchObject({
				system: {
					order: ['directus_roles'],
					collections: { directus_roles: { operationMode: 'full-idempotent' } },
				},
			})
			const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
			output.length = 0
			expect(await runCommand(service.program, 'config', '--collection', 'unknown')).toBe(1)
			expect(error).toHaveBeenLastCalledWith(
				'Failed to inspect Seeder configuration: Unknown system collection: "unknown"',
			)
			const missingConfig = createProgram({
				SEEDER_CONFIG_PATH: path.join(directory, 'missing.json'),
			})
			expect(await runCommand(missingConfig.program, 'config')).toBe(1)
			expect(error).toHaveBeenLastCalledWith(
				expect.stringContaining('Failed to load Seeder configuration'),
			)
			expect(output).toEqual([])
			expectNoServiceCalls(service)
			expectNoServiceCalls(missingConfig)
			expect(mocks.acquireLock).not.toHaveBeenCalled()
		})
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

	it.each([false, true])(
		'blocks full-idempotent without its environment opt-in (full reset=%s) and releases the process lock',
		async (fullReset) => {
			await writeFile(path.join(directory, 'directus_roles.json'), '[]')
			const { program, ItemsService } = createProgram()
			expect(
				await runCommand(
					program,
					'system',
					...(fullReset ? ['--mode', 'full-idempotent'] : []),
					'--force',
					...(fullReset ? ['--full-reset'] : []),
				),
			).toBe(1)
			expect(ItemsService).not.toHaveBeenCalled()
			expect(mocks.acquireLock).toHaveBeenCalledOnce()
			expect(mocks.releaseLock).toHaveBeenCalledOnce()
		},
	)

	it.each([
		{ kind: 'missing', message: 'Seed directory does not exist' },
		{ kind: 'file', message: 'Seed path is not a directory' },
	])('rejects a configured $kind seed directory with its path', async ({ kind, message }) => {
		const root = path.join(directory, 'configured-seeds')
		await mkdir(root)
		const seeds = path.join(root, 'system')
		if (kind === 'file') await writeFile(seeds, 'not a directory')
		else await writeFile(path.join(root, 'directus_roles.json'), '[{"id":"legacy"}]')
		const service = createProgram({ SEEDER_SEEDS_DIR: root })
		const errorLog = vi.spyOn(logger, 'error')
		expect(await runCommand(service.program, 'system')).toBe(1)
		expect(errorLog).toHaveBeenCalledWith(expect.stringContaining(`${message}: "${seeds}"`))
		expectNoServiceCalls(service)
		if (kind === 'missing') {
			await expect(lstat(seeds)).rejects.toMatchObject({ code: 'ENOENT' })
			expect(await readFile(path.join(root, 'directus_roles.json'), 'utf8')).toBe(
				'[{"id":"legacy"}]',
			)
		}
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
		await writeFile(path.join(directory, 'directus_roles.managed-ids.json'), '["new-role"]')
		const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
		const warn = vi.spyOn(logger, 'warn')
		expect(await runCommand(service.program, 'system', '--force')).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_roles',
			expect.any(Object),
		)
		expect(service.FilesService).not.toHaveBeenCalled()
		expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(roles)
		expect(warn).not.toHaveBeenCalled()
		expect(service.clearCache).toHaveBeenCalledExactlyOnceWith({ system: true })
	})

	it('applies collection modes, explicit mode override and JSON processing order', async () => {
		const configPath = path.join(directory, 'consumer.json')
		await writeFile(
			configPath,
			JSON.stringify({
				system: {
					order: ['directus_presets', 'directus_roles'],
					collections: {
						directus_presets: { operationMode: 'insert-update' },
						directus_roles: { operationMode: 'insert-missing' },
					},
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
		const configPath = path.join(directory, 'consumer.config')
		await writeFile(
			configPath,
			JSON.stringify({
				system: { collections: { directus_roles: { operationMode: 'insert-missing' } } },
			}),
		)
		const service = createProgram({ SEEDER_CONFIG_PATH: configPath })
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
						directus_roles: { operationMode: 'insert-missing' },
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

	describe('manifest management', () => {
		const first = '10c85a66-944d-483c-8d74-602cc615f324'
		const second = '6d6a24a9-0575-4eb0-92e1-a74cf88824bd'
		const outsider = 'd48c8805-ac6e-48d2-b81e-ce580f49aa11'
		const target = () => path.join(directory, 'directus_policies.json')
		const manifest = () => path.join(directory, 'directus_policies.managed-ids.json')

		/**
		 * Registers manifest management with config outside cleaned JSON output.
		 * @param overrides - Collection settings that replace defaults shallowly.
		 * @param env - Runtime environment overrides.
		 * @param keyType - Live primary-key type.
		 * @returns Observable CLI fixture.
		 */
		async function createManifestProgram(
			overrides: Record<string, unknown> = {},
			env: Record<string, unknown> = {},
			keyType: 'uuid' | 'string' | 'integer' = 'uuid',
		) {
			const configPath = path.join(directory, 'consumer.config')
			await writeFile(
				configPath,
				JSON.stringify({
					system: {
						order: ['directus_roles'],
						collections: {
							directus_roles: { operationMode: 'insert-missing' },
							directus_policies: {
								operationMode: 'full-idempotent',
								management: { type: 'manifest' },
								...overrides,
							},
						},
					},
				}),
			)
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
				SEEDER_CONTINUE_ON_ERROR: true,
				DEPLOYMENT_ENV: 'development',
				SEEDER_JSON_ONLY: true,
				...env,
			})
			service.getSchema.mockResolvedValue(relationSchema(keyType))
			return service
		}

		/**
		 * Checks global preflight prevented all writes, including earlier collections.
		 * @param service - Observable CLI fixture.
		 * @returns Nothing.
		 */
		function expectNoMutations(service: ReturnType<typeof createProgram>) {
			for (const spy of [
				service.createMany,
				service.upsertMany,
				service.deleteMany,
				service.uploadOne,
				service.clearCache,
				service.database,
			])
				expect(spy).not.toHaveBeenCalled()
		}

		it('creates, unions and sorts history while refreshing current seed data through manual cleanup', async () => {
			const filter = { name: { _eq: 'Managed' } }
			const service = await createManifestProgram({
				fields: ['id', 'name'],
				filter,
				sort: ['id'],
				deep: { permissions: { _limit: 1 } },
			})
			const unrelated = path.join(directory, 'directus_access.managed-ids.json')
			await writeFile(unrelated, 'unselected manifest')
			await writeFile(target(), 'invalid old seed data')
			const extract = () =>
				runCommand(service.program, 'extract', '--include', 'directus_policies')
			service.readByQuery.mockResolvedValue([{ id: second }, { id: second }])
			expect(await extract()).toBe(0)
			expect(JSON.parse(await readFile(manifest(), 'utf8'))).toEqual([second])
			const current = [{ id: first, name: 'Managed' }]
			service.readByQuery.mockResolvedValue(current)
			expect(await extract()).toBe(0)
			const history = await readFile(manifest(), 'utf8')
			expect(history).toBe(JSON.stringify([first, second], null, '\t') + '\n')
			expect(JSON.parse(await readFile(target(), 'utf8'))).toEqual(current)
			expect(await extract()).toBe(0)
			expect(await readFile(manifest(), 'utf8')).toBe(history)
			service.readByQuery.mockResolvedValue([])
			expect(await extract()).toBe(0)
			expect(await readFile(target(), 'utf8')).toBe('[]\n')
			expect(await readFile(manifest(), 'utf8')).toBe(history)
			expect(await readFile(unrelated, 'utf8')).toBe('unselected manifest')
			expect(service.readByQuery).toHaveBeenLastCalledWith({
				limit: -1,
				fields: ['id', 'name'],
				filter,
				sort: ['id'],
				deep: { permissions: { _limit: 1 } },
			})
		})

		it('sorts integer IDs numerically and string IDs lexically using the live schema', async () => {
			const numeric = await createManifestProgram({}, {}, 'integer')
			numeric.readByQuery.mockResolvedValue([{ id: 10 }, { id: 2 }, { id: 10 }])
			expect(
				await runCommand(numeric.program, 'extract', '--include', 'directus_policies'),
			).toBe(0)
			expect(JSON.parse(await readFile(manifest(), 'utf8'))).toEqual([2, 10])
			await rm(manifest())
			const strings = await createManifestProgram({}, {}, 'string')
			strings.readByQuery.mockResolvedValue([
				{ id: 'a' },
				{ id: 'Z' },
				{ id: 'a' },
				{ id: '10' },
				{ id: '2' },
			])
			expect(
				await runCommand(strings.program, 'extract', '--include', 'directus_policies'),
			).toBe(0)
			expect(JSON.parse(await readFile(manifest(), 'utf8'))).toEqual(['10', '2', 'Z', 'a'])
		})

		it('fails extraction without overwriting invalid manifests or losing history on invalid exported IDs', async () => {
			const service = await createManifestProgram({ fields: ['name'] })
			const errorLog = vi.spyOn(logger, 'error')
			service.readByQuery.mockResolvedValue([{ id: first }])
			await writeFile(manifest(), 'invalid JSON')
			expect(
				await runCommand(service.program, 'extract', '--include', 'directus_policies'),
			).toBe(1)
			expect(await readFile(manifest(), 'utf8')).toBe('invalid JSON')
			expect(errorLog).toHaveBeenCalledWith(
				expect.objectContaining({
					message: expect.stringContaining(manifest()),
					cause: expect.any(SyntaxError),
				}),
			)
			const history = JSON.stringify([first])
			await writeFile(manifest(), history)
			for (const row of [
				{ name: 'ID omitted by fields' },
				{ id: 1 },
				{ id: first.toUpperCase() },
			]) {
				service.readByQuery.mockResolvedValue([row])
				expect(
					await runCommand(service.program, 'extract', '--include', 'directus_policies'),
				).toBe(1)
				expect(await readFile(manifest(), 'utf8')).toBe(history)
			}
		})

		it('synchronizes manifest IDs under CLI mode override and leaves manifest bytes unchanged', async () => {
			const rows = [{ id: first, name: 'Updated', enforce_tfa: false }]
			await writeFile(target(), JSON.stringify(rows))
			const history = JSON.stringify([second, first, first])
			await writeFile(manifest(), history)
			const service = await createManifestProgram({ operationMode: 'insert-missing' })
			service.readByQuery
				.mockResolvedValueOnce([{ id: first }])
				.mockResolvedValueOnce([{ id: second }])
			expect(
				await runCommand(
					service.program,
					'system',
					'--mode',
					'full-idempotent',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(0)
			expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(rows)
			expect(service.readByQuery).toHaveBeenLastCalledWith({
				fields: ['id'],
				limit: -1,
				filter: {
					_and: [
						{ id: { _in: expect.arrayContaining([first, second]) } },
						{ id: { _nin: [first] } },
					],
				},
			})
			expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([second])
			expect(await readFile(manifest(), 'utf8')).toBe(history)
		})

		it('bounds empty seed deletion and treats an empty manifest as an empty selection', async () => {
			await writeFile(target(), '[]')
			await writeFile(manifest(), JSON.stringify([first, second]))
			const service = await createManifestProgram()
			service.readByQuery.mockResolvedValue([{ id: second }])
			expect(
				await runCommand(
					service.program,
					'system',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(0)
			expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
				fields: ['id'],
				filter: { _and: [{ id: { _in: [first, second] } }] },
				limit: -1,
			})
			expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([second])
			await writeFile(manifest(), '[]')
			const empty = await createManifestProgram()
			expect(
				await runCommand(
					empty.program,
					'system',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(0)
			expect(empty.readByQuery).not.toHaveBeenCalled()
			expect(empty.upsertMany).not.toHaveBeenCalled()
			expect(empty.deleteMany).not.toHaveBeenCalled()
			await writeFile(target(), JSON.stringify([{ id: first }]))
			const outside = await createManifestProgram()
			expect(
				await runCommand(
					outside.program,
					'system',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(1)
			expectNoMutations(outside)
		})

		it('rejects missing, malformed and unreadable required manifests before any selected collection mutates', async () => {
			await writeFile(
				path.join(directory, 'directus_roles.json'),
				JSON.stringify([{ id: outsider, name: 'Earlier' }]),
			)
			await writeFile(target(), JSON.stringify([{ id: first }]))
			for (const contents of [undefined, '', '{}', '[null]', '[1]', 'invalid JSON']) {
				if (contents === undefined) await rm(manifest(), { force: true })
				else await writeFile(manifest(), contents)
				const service = await createManifestProgram()
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--include',
						'directus_roles',
						'directus_policies',
					),
				).toBe(1)
				expectNoMutations(service)
			}
			await rm(manifest())
			await mkdir(manifest())
			const unreadable = await createManifestProgram()
			expect(
				await runCommand(
					unreadable.program,
					'system',
					'--yes',
					'--include',
					'directus_roles',
					'directus_policies',
				),
			).toBe(1)
			expectNoMutations(unreadable)
		})

		it('rejects schema-incompatible and outside-manifest seed IDs before earlier collection writes', async () => {
			await writeFile(
				path.join(directory, 'directus_roles.json'),
				JSON.stringify([{ id: outsider }]),
			)
			await writeFile(manifest(), JSON.stringify([first]))
			for (const row of [
				{ id: outsider },
				{ id: 1 },
				{ id: first.toUpperCase() },
				{ name: 'Missing ID' },
			]) {
				await writeFile(target(), JSON.stringify([row]))
				const service = await createManifestProgram()
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--include',
						'directus_roles',
						'directus_policies',
					),
				).toBe(1)
				expectNoMutations(service)
			}
		})

		it('keeps opt-in, ignores manifests for insert modes and skips missing collection seeds', async () => {
			const rows = [{ id: first, enforce_tfa: false }]
			await writeFile(target(), JSON.stringify(rows))
			const disabled = await createManifestProgram(
				{},
				{ SEEDER_ENABLE_FULL_IDEMPOTENT: false },
			)
			expect(
				await runCommand(
					disabled.program,
					'system',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(1)
			expectNoServiceCalls(disabled)
			for (const mode of ['insert-missing', 'insert-update']) {
				const service = await createManifestProgram()
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--mode',
						mode,
						'--include',
						'directus_policies',
					),
				).toBe(0)
				expect(
					mode === 'insert-missing' ? service.createMany : service.upsertMany,
				).toHaveBeenCalledExactlyOnceWith(rows)
				expect(service.deleteMany).not.toHaveBeenCalled()
			}
			await rm(target())
			const missing = await createManifestProgram(
				{},
				{ SEEDER_ENABLE_FULL_IDEMPOTENT: false },
			)
			expect(
				await runCommand(
					missing.program,
					'system',
					'--yes',
					'--include',
					'directus_policies',
				),
			).toBe(0)
			expectNoServiceCalls(missing)
		})

		it('inspects declarative manifest settings without reading manifest or live schema', async () => {
			const service = await createManifestProgram(
				{},
				{ SEEDER_ENABLE_FULL_IDEMPOTENT: false },
			)
			const chunks: string[] = []
			vi.spyOn(process.stdout, 'write').mockImplementation((chunk, _encoding, callback) => {
				chunks.push(String(chunk))
				callback?.()
				return true
			})
			expect(
				await runCommand(service.program, 'config', '--collection', 'directus_policies'),
			).toBe(0)
			expect(JSON.parse(chunks.join(''))).toMatchObject({
				system: {
					collections: { directus_policies: { management: { type: 'manifest' } } },
				},
			})
			expectNoServiceCalls(service)
		})
	})

	describe('relation management', () => {
		const policy = '6d6a24a9-0575-4eb0-92e1-a74cf88824bd'
		const outsider = '10c85a66-944d-483c-8d74-602cc615f324'
		const management = { type: 'relation', field: 'policy', collection: 'directus_policies' }

		/**
		 * Registers relation management without putting configuration among cleaned JSON files.
		 * @param overrides - Permission settings overriding the full-idempotent defaults.
		 * @param env - Runtime environment overrides.
		 * @param sources - Other collection settings, independent of raw source seed loading.
		 * @returns Observable CLI fixture with a valid direct relation schema.
		 */
		async function createRelationProgram(
			overrides: Record<string, unknown> = {},
			env: Record<string, unknown> = {},
			sources: Record<string, unknown> = {},
		) {
			const configPath = path.join(directory, 'consumer.config')
			await writeFile(
				configPath,
				JSON.stringify({
					system: {
						collections: {
							directus_roles: { operationMode: 'insert-missing' },
							...sources,
							directus_permissions: {
								operationMode: 'full-idempotent',
								management,
								...overrides,
							},
						},
					},
				}),
			)
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
				SEEDER_CONTINUE_ON_ERROR: true,
				DEPLOYMENT_ENV: 'development',
				SEEDER_JSON_ONLY: true,
				...env,
			})
			service.getSchema.mockResolvedValue(relationSchema())
			return service
		}

		/**
		 * Checks that a failure anywhere in preflight prevents earlier collection mutations.
		 * @param service - Observable CLI fixture.
		 * @returns Nothing.
		 */
		function expectNoMutations(service: ReturnType<typeof createProgram>) {
			for (const spy of [
				service.createMany,
				service.upsertMany,
				service.deleteMany,
				service.uploadOne,
				service.clearCache,
				service.database,
			])
				expect(spy).not.toHaveBeenCalled()
		}

		it('uses excluded raw source IDs under a CLI mode override, without evaluating source settings', async () => {
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				JSON.stringify([{ id: policy, name: { raw: true } }]),
			)
			const rows = [{ id: 1, policy, collection: 'directus_roles', action: 'update' }]
			await writeFile(path.join(directory, 'directus_permissions.json'), JSON.stringify(rows))
			const service = await createRelationProgram(
				{ operationMode: 'insert-missing', filter: { action: { _eq: 'read' } } },
				{},
				{
					directus_policies: {
						management: { type: 'id-range', max: 1 },
						filter: { name: { _eq: 'excluded' } },
					},
				},
			)
			service.readByQuery
				.mockResolvedValueOnce([{ id: 1, policy }])
				.mockResolvedValueOnce([{ id: 1 }])
				.mockResolvedValueOnce([{ id: 2 }])
			expect(
				await runCommand(
					service.program,
					'system',
					'--mode',
					'full-idempotent',
					'--yes',
					'--include',
					'directus_permissions',
					'--exclude',
					'directus_policies',
				),
			).toBe(0)
			expect(service.ItemsService.mock.calls.map(([collection]) => collection)).toEqual([
				'directus_permissions',
				'directus_permissions',
			])
			expect(service.readByQuery).toHaveBeenNthCalledWith(1, {
				fields: ['id', 'policy'],
				filter: { id: { _in: [1] } },
				limit: -1,
			})
			expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(rows)
			expect(service.readByQuery).toHaveBeenLastCalledWith({
				fields: ['id'],
				limit: -1,
				filter: { _and: [{ policy: { _in: [policy] } }, { id: { _nin: [1] } }] },
			})
			expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([2])
		})

		it('manages operations through raw excluded flow IDs and accepts the real two-pass reference updates', async () => {
			const first = 'dbbf2f91-0152-4626-9921-c6bb91bb1ea8'
			const second = '7eb10804-8e43-410b-a568-d77c8e30286d'
			const rows = [
				{ id: first, key: 'first', type: 'log', flow: policy, resolve: second },
				{ id: second, key: 'second', type: 'log', flow: policy },
			]
			await writeFile(
				path.join(directory, 'directus_flows.json'),
				JSON.stringify([{ id: policy, name: 'Raw source flow' }]),
			)
			await writeFile(path.join(directory, 'directus_operations.json'), JSON.stringify(rows))
			const service = await createRelationProgram(
				{},
				{ DEPLOYMENT_ENV: 'production' },
				{
					directus_operations: {
						operationMode: 'full-idempotent',
						management: {
							type: 'relation',
							field: 'flow',
							collection: 'directus_flows',
						},
					},
				},
			)
			const base = relationSchema()
			const relation = base.relations[0]
			if (!relation) throw new Error('Expected relation fixture')
			service.getSchema.mockResolvedValue({
				collections: {
					directus_operations: {
						...base.collections.directus_permissions,
						collection: 'directus_operations',
						fields: {
							id: base.collections.directus_policies.fields.id,
							flow: {
								...base.collections.directus_permissions.fields.policy,
								field: 'flow',
							},
						},
					},
					directus_flows: {
						...base.collections.directus_policies,
						collection: 'directus_flows',
					},
				},
				relations: [
					{
						...relation,
						collection: 'directus_operations',
						field: 'flow',
						related_collection: 'directus_flows',
						schema: {
							...relation.schema,
							table: 'directus_operations',
							column: 'flow',
							foreign_key_table: 'directus_flows',
						},
					},
				],
			} satisfies SchemaOverview)
			expect(
				await runCommand(
					service.program,
					'system',
					'--yes',
					'--include',
					'directus_operations',
					'--exclude',
					'directus_flows',
				),
			).toBe(0)
			expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith([
				{ ...rows[0], resolve: null, reject: null },
				{ ...rows[1], resolve: null, reject: null },
				{ id: first, resolve: second, reject: null, __isUpdateOnly: true },
			])
			expect(service.ItemsService.mock.calls.map(([collection]) => collection)).toEqual([
				'directus_operations',
				'directus_operations',
			])
			expect(service.readByQuery).toHaveBeenLastCalledWith({
				fields: ['id'],
				filter: { _and: [{ flow: { _in: [policy] } }, { id: { _nin: [first, second] } }] },
				limit: -1,
			})
		})

		it.each([
			{ type: 'string', schema: relationSchema('string'), id: 'exact-policy-key' },
			{ type: 'integer', schema: relationSchema('integer'), id: 7 },
		])('accepts a $type source key without coercion', async ({ schema, id }) => {
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				JSON.stringify([{ id }]),
			)
			await writeFile(
				path.join(directory, 'directus_permissions.json'),
				JSON.stringify([{ id: 1, policy: id }]),
			)
			const service = await createRelationProgram()
			service.getSchema.mockResolvedValue(schema)
			expect(
				await runCommand(
					service.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(0)
			expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith([{ id: 1, policy: id }])
		})

		it.each([
			undefined,
			'directory',
			'{broken',
			'{}',
			'[{}]',
			'[null]',
			'[{"id":true}]',
			'[{"id":"invalid-uuid"}]',
			JSON.stringify([{ id: policy.toUpperCase() }]),
		])(
			'rejects required source %j before any earlier selected collection mutates',
			async (contents) => {
				const source = path.join(directory, 'directus_policies.json')
				if (contents === 'directory') await mkdir(source)
				else if (contents !== undefined) await writeFile(source, contents)
				await writeFile(
					path.join(directory, 'directus_roles.json'),
					'[{"id":"earlier-role"}]',
				)
				await writeFile(path.join(directory, 'directus_permissions.json'), '[]')
				const service = await createRelationProgram()
				const error = vi.spyOn(logger, 'error')
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--include',
						'directus_roles',
						'directus_permissions',
					),
				).toBe(1)
				expect(error).toHaveBeenCalledWith(expect.stringContaining(source))
				expect(service.readByQuery).not.toHaveBeenCalled()
				expectNoMutations(service)
			},
		)

		it('requires id primary keys on both source and target before earlier writes', async () => {
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				JSON.stringify([{ id: policy }]),
			)
			await writeFile(path.join(directory, 'directus_permissions.json'), '[]')
			await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"earlier-role"}]')
			for (const collection of ['directus_policies', 'directus_permissions']) {
				const schema = relationSchema()
				if (collection === 'directus_policies')
					schema.collections.directus_policies.primary = 'key'
				else schema.collections.directus_permissions.primary = 'key'
				const service = await createRelationProgram()
				service.getSchema.mockResolvedValue(schema)
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--include',
						'directus_roles',
						'directus_permissions',
					),
				).toBe(1)
				expect(service.readByQuery).not.toHaveBeenCalled()
				expectNoMutations(service)
			}
		})

		it.each(['foreign-key', 'alias'])(
			'rejects an invalid %s relation before earlier writes',
			async (invalid) => {
				await writeFile(
					path.join(directory, 'directus_policies.json'),
					JSON.stringify([{ id: policy }]),
				)
				await writeFile(path.join(directory, 'directus_permissions.json'), '[]')
				await writeFile(
					path.join(directory, 'directus_roles.json'),
					'[{"id":"earlier-role"}]',
				)
				const schema = relationSchema()
				if (invalid === 'foreign-key') {
					const relation = schema.relations[0]
					if (!relation) throw new Error('Expected relation fixture')
					relation.schema.foreign_key_column = 'name'
				} else schema.collections.directus_permissions.fields.policy.alias = true
				const service = await createRelationProgram()
				service.getSchema.mockResolvedValue(schema)
				expect(
					await runCommand(
						service.program,
						'system',
						'--yes',
						'--include',
						'directus_roles',
						'directus_permissions',
					),
				).toBe(1)
				expect(service.readByQuery).not.toHaveBeenCalled()
				expectNoMutations(service)
			},
		)

		it.each([
			{ id: 1, policy: outsider },
			{ id: 1, policy: { id: policy } },
			{ id: 1, policy: null },
			{ id: '1', policy },
			{ policy },
		])('rejects invalid managed target %# before earlier writes', async (row) => {
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				JSON.stringify([{ id: policy }]),
			)
			await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"earlier-role"}]')
			await writeFile(
				path.join(directory, 'directus_permissions.json'),
				JSON.stringify([row]),
			)
			const service = await createRelationProgram()
			expect(
				await runCommand(
					service.program,
					'system',
					'--yes',
					'--include',
					'directus_roles',
					'directus_permissions',
				),
			).toBe(1)
			expect(service.readByQuery).not.toHaveBeenCalled()
			expectNoMutations(service)
		})

		it('rejects a seed-ID collision owned by an outsider before earlier collection writes', async () => {
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				JSON.stringify([{ id: policy }]),
			)
			await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"earlier-role"}]')
			await writeFile(
				path.join(directory, 'directus_permissions.json'),
				JSON.stringify([{ id: 1, policy }]),
			)
			const service = await createRelationProgram()
			service.readByQuery.mockResolvedValue([{ id: 1, policy: outsider }])
			expect(
				await runCommand(
					service.program,
					'system',
					'--yes',
					'--include',
					'directus_roles',
					'directus_permissions',
				),
			).toBe(1)
			expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
				fields: ['id', 'policy'],
				filter: { id: { _in: [1] } },
				limit: -1,
			})
			expectNoMutations(service)
		})

		it('bounds empty target deletion, treats empty source as no-op, and rejects nonempty targets outside empty scope', async () => {
			const source = path.join(directory, 'directus_policies.json')
			const target = path.join(directory, 'directus_permissions.json')
			await writeFile(source, JSON.stringify([{ id: policy }]))
			await writeFile(target, '[]')
			const bounded = await createRelationProgram()
			bounded.readByQuery.mockResolvedValue([{ id: 2 }])
			expect(
				await runCommand(
					bounded.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(0)
			expect(bounded.readByQuery).toHaveBeenCalledExactlyOnceWith({
				fields: ['id'],
				filter: { _and: [{ policy: { _in: [policy] } }] },
				limit: -1,
			})
			expect(bounded.deleteMany).toHaveBeenCalledExactlyOnceWith([2])
			await writeFile(source, '[]')
			const empty = await createRelationProgram()
			expect(
				await runCommand(
					empty.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(0)
			expect(empty.readByQuery).not.toHaveBeenCalled()
			expect(empty.createMany).not.toHaveBeenCalled()
			expect(empty.upsertMany).not.toHaveBeenCalled()
			expect(empty.deleteMany).not.toHaveBeenCalled()
			await writeFile(target, JSON.stringify([{ id: 1, policy }]))
			const outside = await createRelationProgram()
			expect(
				await runCommand(
					outside.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(1)
			expect(outside.readByQuery).not.toHaveBeenCalled()
			expectNoMutations(outside)
		})

		it('requires full-idempotent opt-in, ignores relation management in other modes, and skips missing targets without source input', async () => {
			const target = path.join(directory, 'directus_permissions.json')
			await writeFile(target, JSON.stringify([{ id: 1, policy }]))
			const disabled = await createRelationProgram(
				{},
				{ SEEDER_ENABLE_FULL_IDEMPOTENT: false },
			)
			expect(
				await runCommand(
					disabled.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(1)
			expectNoServiceCalls(disabled)
			for (const mode of ['insert-missing', 'insert-update']) {
				const service = await createRelationProgram()
				expect(
					await runCommand(
						service.program,
						'system',
						'--mode',
						mode,
						'--yes',
						'--include',
						'directus_permissions',
					),
				).toBe(0)
				expect(
					mode === 'insert-missing' ? service.createMany : service.upsertMany,
				).toHaveBeenCalledExactlyOnceWith([{ id: 1, policy }])
				expect(service.deleteMany).not.toHaveBeenCalled()
			}
			await rm(target)
			const missing = await createRelationProgram(
				{},
				{ SEEDER_ENABLE_FULL_IDEMPOTENT: false },
			)
			expect(
				await runCommand(
					missing.program,
					'system',
					'--yes',
					'--include',
					'directus_permissions',
				),
			).toBe(0)
			expectNoServiceCalls(missing)
		})

		it('extracts live policies and permissions without seed input and refreshes added, changed and removed records', async () => {
			const source = path.join(directory, 'directus_policies.json')
			const target = path.join(directory, 'directus_permissions.json')
			const service = await createRelationProgram()
			for (const policies of [
				[{ id: policy }],
				[
					{ id: policy, name: 'Updated' },
					{ id: outsider, name: 'New' },
				],
				[],
			]) {
				const permissions = policies.map(({ id }, index) => ({ id: index + 1, policy: id }))
				service.readByQuery
					.mockResolvedValueOnce(policies)
					.mockResolvedValueOnce(permissions)
				expect(
					await runCommand(
						service.program,
						'extract',
						'--include',
						'directus_policies',
						'directus_permissions',
					),
				).toBe(0)
				expect(JSON.parse(await readFile(source, 'utf8'))).toEqual(policies)
				expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(permissions)
			}
		})

		it('uses each collection extraction query independently of relation management and existing source files', async () => {
			const source = path.join(directory, 'directus_policies.json')
			const target = path.join(directory, 'directus_permissions.json')
			const policyFilter = { name: { _eq: 'Editor' } }
			const filter = { action: { _eq: 'read' } }
			const service = await createRelationProgram(
				{ fields: ['id', 'policy'], filter, sort: ['id'], deep: { policy: { _limit: 1 } } },
				{},
				{ directus_policies: { fields: ['id'], filter: policyFilter } },
			)
			const permissions = [{ id: 1, policy: outsider }]
			service.readByQuery
				.mockResolvedValueOnce([{ id: policy }])
				.mockResolvedValueOnce(permissions)
			expect(
				await runCommand(
					service.program,
					'extract',
					'--include',
					'directus_policies',
					'directus_permissions',
				),
			).toBe(0)
			expect(service.readByQuery).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({ filter: policyFilter }),
			)
			expect(service.readByQuery).toHaveBeenNthCalledWith(2, {
				limit: -1,
				fields: ['id', 'policy'],
				filter,
				sort: ['id'],
				deep: { policy: { _limit: 1 } },
			})
			expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(permissions)
			// Stale, empty, invalid and absent source files never define the extraction selection.
			for (const contents of ['[]', 'invalid JSON', undefined]) {
				if (contents === undefined) await rm(source, { force: true })
				else await writeFile(source, contents)
				service.readByQuery.mockClear().mockResolvedValue(permissions)
				expect(
					await runCommand(
						service.program,
						'extract',
						'--include',
						'directus_permissions',
					),
				).toBe(0)
				expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
					limit: -1,
					fields: ['id', 'policy'],
					filter,
					sort: ['id'],
					deep: { policy: { _limit: 1 } },
				})
				expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(permissions)
				await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' })
			}
		})
	})

	describe('Flow-folder schema compatibility', () => {
		it.each([false, true])(
			'extracts inherited defaults with Flow-folder support=%s',
			async (supported) => {
				const configPath = path.join(directory, 'consumer.json')
				// A non-fields override must retain compatibility for inherited fields.
				await writeFile(
					configPath,
					JSON.stringify({
						system: { collections: { directus_folders: { filter: null } } },
					}),
				)
				const service = createProgram({
					DEPLOYMENT_ENV: 'development',
					SEEDER_JSON_ONLY: true,
					SEEDER_CONFIG_PATH: configPath,
				})
				service.getSchema.mockResolvedValue({
					collections: {
						directus_folders: {
							primary: 'id',
							fields: { id: { type: 'string' }, ...(supported ? { type: {} } : {}) },
						},
						directus_flows: { fields: supported ? { folder: {} } : {} },
					},
				})
				const folders = [
					{ id: 'folder', name: 'Folder', ...(supported ? { type: 'flows' } : {}) },
				]
				const flows = [
					{ id: 'flow', name: 'Flow', ...(supported ? { folder: 'folder' } : {}) },
				]
				service.readByQuery.mockResolvedValueOnce(folders).mockResolvedValueOnce(flows)
				expect(
					await runCommand(
						service.program,
						'extract',
						'--include',
						'directus_folders',
						'directus_flows',
					),
				).toBe(0)
				for (const [index, collection, optionalField] of [
					[0, 'directus_folders', 'type'],
					[1, 'directus_flows', 'folder'],
				] satisfies [number, string, string][]) {
					const defaults = SYSTEM_COLLECTIONS.find(
						(entry) => entry.collection === collection,
					)?.fields
					expect(service.readByQuery.mock.calls[index]?.[0]).toMatchObject({
						fields: supported
							? defaults
							: defaults?.filter((field) => field !== optionalField),
					})
				}
				expect(
					JSON.parse(
						await readFile(path.join(directory, 'directus_folders.json'), 'utf8'),
					),
				).toEqual(folders)
				expect(
					JSON.parse(await readFile(path.join(directory, 'directus_flows.json'), 'utf8')),
				).toEqual(flows)
			},
		)

		it.each(
			[
				['id'],
				null,
				['*'],
				['id', 'folder.name'],
				['id', 'unknown'],
				SYSTEM_COLLECTIONS.find((entry) => entry.collection === 'directus_flows')?.fields,
			].map((fields) => ({ fields })),
		)('preserves explicit consumer fields %# on an older schema', async ({ fields }) => {
			const configPath = path.join(directory, 'consumer.json')
			await writeFile(
				configPath,
				JSON.stringify({ system: { collections: { directus_flows: { fields } } } }),
			)
			const service = createProgram({
				DEPLOYMENT_ENV: 'development',
				SEEDER_JSON_ONLY: true,
				SEEDER_CONFIG_PATH: configPath,
			})
			await runCommand(service.program, 'extract', '--include', 'directus_flows')
			expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ fields: fields ?? ['*'] }),
			)
		})

		it('propagates Directus errors for explicit missing fields without retrying or filtering', async () => {
			const configPath = path.join(directory, 'consumer.json')
			await writeFile(
				configPath,
				JSON.stringify({
					system: {
						collections: { directus_folders: { fields: ['id', 'type', 'unknown'] } },
					},
				}),
			)
			const service = createProgram({
				DEPLOYMENT_ENV: 'development',
				SEEDER_JSON_ONLY: true,
				SEEDER_CONFIG_PATH: configPath,
			})
			service.readByQuery.mockRejectedValue(new Error('Unknown field'))
			expect(
				await runCommand(service.program, 'extract', '--include', 'directus_folders'),
			).toBe(1)
			expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ fields: ['id', 'type', 'unknown'] }),
			)
		})

		it.each([false, true])(
			'imports legacy-equivalent newer data with Flow-folder support=%s',
			async (supported) => {
				const folders = [
					{
						id: 'folder',
						name: 'Files',
						type: 'files',
						unknown: 'preserved for Directus',
					},
				]
				const flows = [{ id: 'flow', name: 'Flow', folder: null }]
				await writeFile(
					path.join(directory, 'directus_folders.json'),
					JSON.stringify(folders),
				)
				await writeFile(path.join(directory, 'directus_flows.json'), JSON.stringify(flows))
				const service = createProgram({ DEPLOYMENT_ENV: 'development' })
				service.getSchema.mockResolvedValue({
					collections: {
						directus_folders: { fields: supported ? { type: {} } : {} },
						directus_flows: { fields: supported ? { folder: {} } : {} },
					},
				})
				expect(
					await runCommand(service.program, 'system', '--mode', 'insert-update', '--yes'),
				).toBe(0)
				expect(service.upsertMany.mock.calls).toEqual(
					supported
						? [[folders], [flows]]
						: [
								[
									[
										{
											id: 'folder',
											name: 'Files',
											unknown: 'preserved for Directus',
										},
									],
								],
								[[{ id: 'flow', name: 'Flow' }]],
							],
				)
				// Compatibility never rewrites source seed files.
				expect(
					JSON.parse(
						await readFile(path.join(directory, 'directus_folders.json'), 'utf8'),
					),
				).toEqual(folders)
			},
		)

		it.each([
			{ collection: 'directus_folders', field: 'type', value: 'flows' },
			{ collection: 'directus_folders', field: 'type', value: null },
			{ collection: 'directus_flows', field: 'folder', value: 'folder' },
		])(
			'rejects unrepresentable $collection.$field before earlier mutations',
			async ({ collection, field, value }) => {
				await writeFile(
					path.join(directory, 'directus_roles.json'),
					'[{"id":"role","name":"Earlier role"}]',
				)
				await writeFile(
					path.join(directory, `${collection}.json`),
					JSON.stringify([{ id: 'item', name: 'Item', [field]: value }]),
				)
				const service = createProgram({
					DEPLOYMENT_ENV: 'development',
					SEEDER_CONTINUE_ON_ERROR: true,
				})
				const error = vi.spyOn(logger, 'error')
				expect(
					await runCommand(service.program, 'system', '--mode', 'insert-update', '--yes'),
				).toBe(1)
				expect(error).toHaveBeenCalledWith(
					expect.stringContaining(
						`${collection}.json processed row 1: target schema lacks ${collection}.${field}`,
					),
				)
				expect(service.ItemsService).not.toHaveBeenCalled()
				expect(service.createMany).not.toHaveBeenCalled()
				expect(service.upsertMany).not.toHaveBeenCalled()
				expect(service.deleteMany).not.toHaveBeenCalled()
				expect(
					await runCommand(
						service.program,
						'system',
						'--mode',
						'insert-missing',
						'--include',
						'directus_roles',
					),
				).toBe(0)
			},
		)

		it('preserves Flow-folder data and omitted legacy keys when the schema supports them', async () => {
			const folders = [
				{ id: 'folder', name: 'Flows', type: 'flows' },
				{ id: 'legacy', name: 'Legacy' },
			]
			const flows = [
				{ id: 'flow', name: 'Flow', folder: 'folder' },
				{ id: 'legacy-flow', name: 'Legacy' },
			]
			await writeFile(path.join(directory, 'directus_folders.json'), JSON.stringify(folders))
			await writeFile(path.join(directory, 'directus_flows.json'), JSON.stringify(flows))
			const service = createProgram({ DEPLOYMENT_ENV: 'development' })
			service.getSchema.mockResolvedValue({
				collections: {
					directus_folders: { fields: { type: {} } },
					directus_flows: { fields: { folder: {} } },
				},
			})
			expect(
				await runCommand(service.program, 'system', '--mode', 'insert-update', '--yes'),
			).toBe(0)
			expect(service.upsertMany.mock.calls).toEqual([[folders], [flows]])
		})
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
		await writeFile(path.join(directory, 'directus_roles.managed-ids.json'), '["role"]')
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
		expect(service.ItemsService).not.toHaveBeenCalled()
		expect(mocks.releaseLock).toHaveBeenCalledOnce()
	})

	it('keeps configured management when CLI overrides the mode and deletes only obsolete managed IDs', async () => {
		presets.management = { type: 'id-range', max: 50000 }
		const seeds = [{ id: 1, bookmark: 'Restored' }]
		await writeFile(path.join(directory, 'directus_presets.json'), JSON.stringify(seeds))
		const service = createProgram({
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
		await writeFile(path.join(directory, 'directus_translations.json'), '[]')
		service.ItemsService.mockClear()
		service.readByQuery.mockClear().mockResolvedValue([])
		service.deleteMany.mockClear()
		expect(
			await runCommand(service.program, 'system', '--mode', 'full-idempotent', '--yes'),
		).toBe(0)
		expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
			'directus_translations',
			expect.any(Object),
		)
		expect(service.deleteMany).not.toHaveBeenCalled()
	})

	describe('full reset', () => {
		it.each([
			{ type: 'id-range', max: 50000 },
			{ type: 'relation', field: 'user', collection: 'directus_users' },
			{ type: 'manifest' },
		])(
			'ignores $type management without management inputs and deletes outside the usual scope',
			async (management) => {
				const configPath = path.join(directory, 'consumer.config')
				const config = JSON.stringify({
					system: {
						collections: {
							directus_presets: { operationMode: 'insert-missing', management },
						},
					},
				})
				await writeFile(configPath, config)
				const rows = [{ id: 50001, bookmark: 'Restored' }]
				await writeFile(path.join(directory, 'directus_presets.json'), JSON.stringify(rows))
				const service = createProgram({
					SEEDER_CONFIG_PATH: configPath,
					SEEDER_ENABLE_FULL_IDEMPOTENT: true,
				})
				service.readByQuery
					.mockResolvedValueOnce([{ id: 50001 }])
					.mockResolvedValueOnce([{ id: 2 }, { id: 60000 }])
				expect(
					await runCommand(
						service.program,
						'system',
						'--mode',
						'full-idempotent',
						'--full-reset',
						'--include',
						'directus_presets',
						'--yes',
					),
				).toBe(0)
				expect(service.upsertMany).toHaveBeenCalledExactlyOnceWith(rows)
				expect(service.readByQuery).toHaveBeenLastCalledWith({
					fields: ['id'],
					filter: { id: { _nin: [50001] } },
					limit: -1,
				})
				expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([2, 60000])
				expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
					'directus_presets',
					expect.any(Object),
				)
				expect(await readFile(configPath, 'utf8')).toBe(config)
				expect((await readdir(directory)).sort()).toEqual([
					'consumer.config',
					'directus_presets.json',
				])
			},
		)

		it('clears a selected collection with [] but skips it when its seed file is missing', async () => {
			presets.management = { type: 'manifest' }
			const filename = path.join(directory, 'directus_presets.json')
			await writeFile(filename, '[]')
			const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
			service.readByQuery.mockResolvedValue([{ id: 2 }, { id: 60000 }])
			const run = () =>
				runCommand(
					service.program,
					'system',
					'--mode',
					'full-idempotent',
					'--full-reset',
					'--include',
					'directus_presets',
					'--yes',
				)
			expect(await run()).toBe(0)
			expect(service.readByQuery).toHaveBeenCalledExactlyOnceWith({
				fields: ['id'],
				filter: { id: { _nin: [] } },
				limit: -1,
			})
			expect(service.deleteMany).toHaveBeenCalledExactlyOnceWith([2, 60000])
			await rm(filename)
			vi.clearAllMocks()
			expect(await run()).toBe(0)
			expectNoServiceCalls(service)
		})

		it.each(['insert-missing', 'insert-update'])(
			'rejects an effective %s mode globally before mutations and confirmation',
			async (operationMode) => {
				const configPath = path.join(directory, 'consumer.config')
				await writeFile(
					configPath,
					JSON.stringify({
						system: { collections: { directus_presets: { operationMode } } },
					}),
				)
				await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
				await writeFile(path.join(directory, 'directus_presets.json'), '[]')
				const service = createProgram({
					SEEDER_CONFIG_PATH: configPath,
					SEEDER_ENABLE_FULL_IDEMPOTENT: true,
					SEEDER_CONTINUE_ON_ERROR: true,
				})
				const errorLog = vi.spyOn(logger, 'error')
				const skip = vi.spyOn(confirmations, 'shouldSkipConfirmation')
				expect(await runCommand(service.program, 'system', '--full-reset')).toBe(1)
				expect(errorLog).toHaveBeenCalledWith(
					expect.stringContaining(
						'--full-reset requires full-idempotent mode for collection "directus_presets"',
					),
				)
				expectNoServiceCalls(service)
				expect(skip).not.toHaveBeenCalled()
			},
		)

		it('checks only included, non-excluded collections with present seed files', async () => {
			presets.operationMode = 'insert-update'
			await writeFile(path.join(directory, 'directus_presets.json'), '[]')
			await writeFile(path.join(directory, 'directus_roles.json'), '[]')
			await writeFile(
				path.join(directory, 'directus_policies.json'),
				'{invalid unselected data',
			)
			const service = createProgram({
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
			})
			expect(
				await runCommand(
					service.program,
					'system',
					'--full-reset',
					'--include',
					'directus_roles',
					'directus_presets',
					'directus_access',
					'--exclude',
					'directus_presets',
					'--yes',
				),
			).toBe(0)
			expect(service.ItemsService).toHaveBeenCalledExactlyOnceWith(
				'directus_roles',
				expect.any(Object),
			)
		})

		it('preserves global seed-file preflight before any full reset mutations', async () => {
			await writeFile(path.join(directory, 'directus_roles.json'), '[{"id":"role"}]')
			await writeFile(path.join(directory, 'directus_presets.json'), '{broken')
			const service = createProgram({
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
				SEEDER_CONTINUE_ON_ERROR: true,
			})
			expect(
				await runCommand(
					service.program,
					'system',
					'--mode',
					'full-idempotent',
					'--full-reset',
					'--yes',
				),
			).toBe(1)
			expectNoServiceCalls(service)
		})

		it('warns about the entire collection, honors cancellation and DELETE, and retains --yes/--force', async () => {
			await writeFile(path.join(directory, 'directus_presets.json'), '[]')
			presets.management = { type: 'manifest' }
			presets.operationMode = 'full-idempotent'
			const service = createProgram({ SEEDER_ENABLE_FULL_IDEMPOTENT: true })
			vi.spyOn(confirmations, 'shouldSkipConfirmation').mockImplementation((force) => force)
			const explicit = vi.spyOn(confirmations, 'confirmExplicit').mockResolvedValue(false)
			expect(await runCommand(service.program, 'system', '--full-reset')).toBe(0)
			expect(explicit).toHaveBeenCalledExactlyOnceWith(
				expect.stringContaining('ENTIRE selected collection'),
				'DELETE',
				logger,
			)
			expectNoServiceCalls(service)
			explicit.mockResolvedValue(true)
			expect(await runCommand(service.program, 'system', '--full-reset')).toBe(0)
			expect(service.clearCache).toHaveBeenCalledOnce()
			explicit.mockClear()
			for (const flag of ['--yes', '--force'])
				expect(await runCommand(service.program, 'system', '--full-reset', flag)).toBe(0)
			expect(explicit).not.toHaveBeenCalled()
			expect(service.clearCache).toHaveBeenCalledTimes(3)
		})
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
		'treats [] as intentional empty data in %s with built-in management explicitly cleared',
		async (mode) => {
			const configPath = path.join(directory, 'consumer.config')
			await writeFile(
				configPath,
				JSON.stringify({
					system: { collections: { directus_roles: { management: null } } },
				}),
			)
			await writeFile(path.join(directory, 'directus_roles.json'), '[]')
			const service = createProgram({
				SEEDER_CONFIG_PATH: configPath,
				SEEDER_ENABLE_FULL_IDEMPOTENT: true,
			})
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
			expect(
				await runCommand(service.program, 'system', '--mode', 'insert-missing', ...flags),
			).toBe(0)
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
		expect(
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-missing',
				'--include',
				'directus_roles',
			),
		).toBe(0)
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
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-missing',
				'--exclude',
				'directus_permissions',
			),
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
					'--mode',
					'insert-missing',
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
				'--mode',
				'insert-missing',
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
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-missing',
				'--include',
				'directus_operations',
			),
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
		expect(await runCommand(service.program, 'system', '--mode', 'insert-missing')).toBe(1)
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
		expect(await runCommand(service.program, 'system', '--mode', 'insert-missing')).toBe(1)
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
		expect(await runCommand(service.program, 'system', '--mode', 'insert-missing')).toBe(1)
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
		expect(
			await runCommand(
				service.program,
				'system',
				'--mode',
				'insert-missing',
				'--include',
				'directus_files',
			),
		).toBe(0)
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

	it('uses the built-in collection mode and validated environment lists unless explicit CLI options override them', async () => {
		await writeFile(
			path.join(directory, 'directus_settings.json'),
			JSON.stringify([{ id: 1, project_name: 'Fixture' }]),
		)
		const service = createProgram({
			SEEDER_INCLUDE: 'directus_settings',
			SEEDER_EXCLUDE: 'directus_roles',
		})
		service.readByQuery.mockResolvedValue([{ id: 1 }])
		// Startup is a snapshot: later raw-environment changes must not trigger another parse.
		service.context.env.SEEDER_INCLUDE = 'invalid-after-registration'
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
				'--mode',
				'insert-missing',
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
		await mkdir(path.join(seedRoot, 'core', 'assets'), { recursive: true })
		const outsideSystem = ['root.json', 'core/posts.json', 'core/assets/keep.bin']
		for (const filename of outsideSystem)
			await writeFile(path.join(seedRoot, filename), filename)
		for (const filename of [...removed, ...preserved])
			await writeFile(path.join(directory, filename), filename)
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_AUTO_EXTRACT_INCLUDE: 'directus_presets',
		})
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
		for (const filename of outsideSystem)
			expect(await readFile(path.join(seedRoot, filename), 'utf8')).toBe(filename)
	})

	it('creates missing system and asset output directories without creating core', async () => {
		await rm(directory, { recursive: true })
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		expect(await runCommand(service.program, 'extract', '--include', 'directus_roles')).toBe(0)
		expect(await readFile(path.join(directory, 'directus_roles.json'), 'utf8')).toBe('[]\n')
		expect((await lstat(path.join(directory, 'assets'))).isDirectory()).toBe(true)
		expect(await readdir(seedRoot)).toEqual(['system'])
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

	it.each([
		['--json-only', '--assets'],
		['--assets', '--json-only'],
		['--clear'],
		['--full-reset'],
	])('rejects invalid extraction flags %s %s before lock, read, or cleanup', async (...flags) => {
		const stale = path.join(directory, 'stale.json')
		await writeFile(stale, 'stale')
		const service = createProgram({ DEPLOYMENT_ENV: 'development' })
		await expect(
			service.program.parseAsync(['seed', 'extract', ...flags], { from: 'user' }),
		).rejects.toMatchObject({ exitCode: 1 })
		const message = service.writeErr.mock.calls.flat().join('')
		if (flags.length === 1) expect(message).toContain(`unknown option '${flags[0]}'`)
		else {
			expect(message).toContain('--json-only')
			expect(message).toContain('--assets')
			expect(message).toMatch(/cannot be used|conflict/iu)
		}
		expect(mocks.acquireLock).not.toHaveBeenCalled()
		expect(service.readByQuery).not.toHaveBeenCalled()
		expect(service.readFiles).not.toHaveBeenCalled()
		expect(await readFile(stale, 'utf8')).toBe('stale')
	})

	it('cleans configured external directories while preserving adjacent files', async () => {
		const root = path.join(directory, 'external-seeds')
		const seeds = path.join(root, 'system')
		const assets = path.join(directory, 'external-assets')
		await mkdir(seeds, { recursive: true })
		await mkdir(assets)
		await writeFile(path.join(seeds, 'stale.json'), 'stale')
		await writeFile(path.join(assets, 'stale.bin'), 'stale asset')
		await writeFile(path.join(directory, 'outside.json'), 'outside')
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_SEEDS_DIR: root,
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
			const root = path.join(directory, 'seeds')
			const seeds = path.join(root, 'system')
			const assets = path.join(directory, 'assets')
			const blocked = path.join(directory, 'blocked')
			await mkdir(seeds, { recursive: true })
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
						: root
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
		const root = path.join(directory, 'seeds')
		const seeds = path.join(root, 'system')
		const assets = path.join(directory, 'assets')
		const outside = path.join(directory, 'outside.json')
		await mkdir(seeds, { recursive: true })
		await mkdir(assets)
		await writeFile(outside, 'outside')
		await symlink(outside, path.join(seeds, 'linked.json'))
		await symlink(outside, path.join(assets, 'linked.bin'))
		const service = createProgram({
			DEPLOYMENT_ENV: 'development',
			SEEDER_SEEDS_DIR: root,
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
			const root = path.join(directory, 'seeds')
			const seeds = path.join(root, 'system')
			const assets = path.join(directory, 'assets')
			const outside = path.join(directory, 'outside')
			await mkdir(seeds, { recursive: true })
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
				SEEDER_SEEDS_DIR: root,
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
