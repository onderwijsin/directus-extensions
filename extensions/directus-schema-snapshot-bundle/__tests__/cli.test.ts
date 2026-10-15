import type { Snapshot, SnapshotDiff, SnapshotDiffWithHash } from '@directus/types'

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Command } from 'commander'
import { dump } from 'js-yaml'
import hash from 'object-hash'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Init = (event: string, handler: (metadata: { program: unknown }) => void) => void
type HookRegister = (
	functions: { init: Init },
	context: { env: Record<string, unknown>; logger: typeof logger },
) => void

const mocks = vi.hoisted(() => {
	const register = vi.fn<HookRegister>()
	const service = {
		snapshot: vi.fn<() => Promise<Snapshot>>(),
		diff: vi.fn<
			(
				snapshot: Snapshot,
				options: { currentSnapshot: Snapshot; force: boolean },
			) => Promise<SnapshotDiff | null>
		>(),
		apply: vi.fn<(payload: SnapshotDiffWithHash) => Promise<void>>(),
	}
	return {
		directory: '',
		register,
		service,
		getSchemaService: vi.fn(() => Promise.resolve(service)),
		initializeLicenseManager: vi.fn<() => Promise<void>>(),
		terminate: vi.fn<(code: number) => void>(),
		defineHook: vi.fn((callback: HookRegister) => register.mockImplementation(callback)),
	}
})

vi.mock('@onderwijsin/directus-extension-utils/hook', () => ({ defineHook: mocks.defineHook }))
vi.mock('../src/shared/getSchemaService', () => ({ getSchemaService: mocks.getSchemaService }))
vi.mock('../src/shared/initializeLicenseManager', () => ({
	initializeLicenseManager: mocks.initializeLicenseManager,
}))
vi.mock('../src/shared/terminate', () => ({ terminate: mocks.terminate }))
vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return { ...actual, default: { ...actual, tmpdir: () => mocks.directory } }
})

import '../src/cli-hook'

const logger = pino({ level: 'silent' })
const snapshot: Snapshot = {
	version: 1,
	directus: '12.2.0',
	vendor: 'sqlite',
	collections: [],
	fields: [],
	relations: [],
	systemFields: [],
}
const diff: SnapshotDiff = { collections: [], fields: [], relations: [], systemFields: [] }
const systemField = {
	collection: 'directus_files',
	field: 'title',
	schema: { is_indexed: false },
}
const systemFieldPath = `directus_files_${hash(systemField.collection).slice(0, 8)}/systemFields/title_${hash(systemField.field).slice(0, 8)}.yml`
let directory = ''

/**
 * Registers the hook on an actual Commander program without constructing Directus services.
 * @param env - Directus environment supplied to the hook.
 * @returns Captured initialization registrations and the real CLI program.
 */
function createProgram(env: Record<string, unknown> = {}) {
	const init = vi.fn<Init>()
	const program = new Command().exitOverride().configureOutput({ writeErr: vi.fn() })
	mocks.register({ init }, { env, logger })
	const callback = init.mock.calls.find(([event]) => event === 'cli.after')?.[1]
	callback?.({ program })
	return { init, program }
}

/**
 * Writes the snapshot metadata file required by apply.
 * @returns A promise that resolves when metadata is written.
 */
async function writeMetadata() {
	await writeFile(
		path.join(directory, 'metadata.yml'),
		dump({ version: 1, directus: '12.2.0', vendor: 'sqlite' }),
	)
}

/**
 * Confirms ordinary success and failure paths release the apply marker.
 * @param code - Expected CLI exit code.
 * @returns Nothing.
 */
function expectApplyExit(code: number) {
	expect(mocks.terminate).toHaveBeenLastCalledWith(code)
	expect(existsSync(path.join(mocks.directory, 'directus-schema-applying.flag'))).toBe(false)
}

describe('schema-split CLI', () => {
	beforeEach(async () => {
		vi.clearAllMocks()
		mocks.directory = await mkdtemp(path.join(tmpdir(), 'schema-split-cli-'))
		directory = path.join(mocks.directory, 'snapshots')
		await mkdir(directory)
		mocks.getSchemaService.mockResolvedValue(mocks.service)
		mocks.service.snapshot.mockReset().mockResolvedValue(snapshot)
		mocks.service.diff.mockReset().mockResolvedValue(null)
		mocks.service.apply.mockReset().mockResolvedValue(undefined)
		mocks.initializeLicenseManager.mockReset().mockResolvedValue(undefined)
	})

	afterEach(async () => {
		await rm(mocks.directory, { recursive: true, force: true })
	})

	it('registers command names, aliases, default folder, and the shared disable switch', () => {
		const { program } = createProgram({
			SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: ` ${directory} `,
		})
		const commands = program.commands[0]?.commands
		expect(commands?.map((command) => command.name())).toEqual(['apply', 'snapshot', 'migrate'])
		expect(commands?.[0]?.registeredArguments[0]?.defaultValue).toBe(directory)
		expect(commands?.[1]?.options[0]?.flags).toBe('-o, --output [folder]')
		expect(commands?.[1]?.options[0]?.defaultValue).toBe(directory)
		expect(commands?.[2]?.options.map((option) => option.flags)).toEqual([
			'-o, --output [folder]',
			'-i, --input <file>',
		])
		expect(createProgram({ SCHEMA_SNAPSHOT_ENABLED: false }).init).not.toHaveBeenCalled()
		expect(
			createProgram().program.commands[0]?.commands[0]?.registeredArguments[0]?.defaultValue,
		).toBe('/directus/snapshots')
	})

	it('clears snapshot output but preserves unrelated output during migration', async () => {
		const source = { ...snapshot, systemFields: [systemField] }
		mocks.service.snapshot.mockResolvedValue(source)
		const stalePath = path.join(directory, 'stale.txt')
		await writeFile(stalePath, 'stale')
		await createProgram({
			SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: directory,
		}).program.parseAsync(['schema-split', 'snapshot'], { from: 'user' })
		expect(mocks.terminate).toHaveBeenLastCalledWith(0)
		expect(existsSync(stalePath)).toBe(false)
		expect(await readFile(path.join(directory, 'metadata.yml'), 'utf8')).toBe(
			dump({ version: 1, directus: '12.2.0', vendor: 'sqlite' }, { noRefs: true }),
		)
		const systemFieldFile = path.join(directory, systemFieldPath)
		expect(await readFile(systemFieldFile, 'utf8')).toBe(dump(systemField, { noRefs: true }))
		await rm(systemFieldFile)
		await writeFile(stalePath, 'keep')
		const input = path.join(directory, 'original.yml')
		await writeFile(input, dump(source))
		await createProgram().program.parseAsync(
			['schema-split', 'migrate', '--input', input, '--output', directory],
			{ from: 'user' },
		)
		expect(await readFile(stalePath, 'utf8')).toBe('keep')
		expect(await readFile(systemFieldFile, 'utf8')).toBe(dump(systemField, { noRefs: true }))
		expect(mocks.terminate).toHaveBeenLastCalledWith(0)
	})

	it.each(['snapshot', 'migrate'])(
		'rejects a valueless output option for %s',
		async (command) => {
			const args = command === 'migrate' ? ['-i', '/unused.yml', '-o'] : ['--output']
			await createProgram().program.parseAsync(['schema-split', command, ...args], {
				from: 'user',
			})
			expect(mocks.terminate).toHaveBeenCalledWith(1)
			expect(mocks.service.snapshot).not.toHaveBeenCalled()
		},
	)

	it('requires the migration input option', async () => {
		await expect(
			createProgram().program.parseAsync(['schema-split', 'migrate'], { from: 'user' }),
		).rejects.toThrow('required option')
	})

	it('fails snapshot creation without clearing existing output when the service fails', async () => {
		await writeFile(path.join(directory, 'keep.txt'), 'keep')
		mocks.service.snapshot.mockRejectedValue(new Error('database unavailable'))
		await createProgram().program.parseAsync(['schema-split', 'snapshot', '-o', directory], {
			from: 'user',
		})
		expect(mocks.terminate).toHaveBeenCalledWith(1)
		expect(await readFile(path.join(directory, 'keep.txt'), 'utf8')).toBe('keep')
	})

	it('returns success without apply when the current schema already matches', async () => {
		await writeMetadata()
		await createProgram({
			SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: directory,
		}).program.parseAsync(['schema-split', 'apply'], { from: 'user' })
		expect(mocks.initializeLicenseManager).toHaveBeenCalledOnce()
		expect(mocks.service.diff).toHaveBeenCalledWith(snapshot, {
			currentSnapshot: snapshot,
			force: true,
		})
		expect(mocks.service.apply).not.toHaveBeenCalled()
		expectApplyExit(0)
	})

	it('uses saved system fields on each forced diff while hashing the unmodified current snapshot', async () => {
		await writeMetadata()
		const systemFieldFile = path.join(directory, systemFieldPath)
		await mkdir(path.dirname(systemFieldFile), { recursive: true })
		await writeFile(systemFieldFile, dump(systemField))
		const desired = { ...snapshot, systemFields: [systemField] }
		const current: Snapshot = {
			...snapshot,
			directus: '12.1.0',
			systemFields: [
				{ collection: 'directus_files', field: 'title', schema: { is_indexed: true } },
			],
		}
		const updated: Snapshot = {
			...snapshot,
			directus: '12.1.1',
			systemFields: [
				{ collection: 'directus_users', field: 'first_name', schema: { is_indexed: true } },
			],
		}
		mocks.service.snapshot.mockResolvedValueOnce(current).mockResolvedValueOnce(updated)
		mocks.service.diff.mockResolvedValueOnce(diff).mockResolvedValueOnce(null)
		mocks.service.apply.mockImplementationOnce(() => {
			expect(existsSync(path.join(mocks.directory, 'directus-schema-applying.flag'))).toBe(
				true,
			)
			return Promise.resolve()
		})
		await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
			from: 'user',
		})
		expect(mocks.service.diff).toHaveBeenNthCalledWith(1, desired, {
			currentSnapshot: current,
			force: true,
		})
		expect(mocks.service.diff).toHaveBeenNthCalledWith(2, desired, {
			currentSnapshot: updated,
			force: true,
		})
		expect(mocks.service.apply).toHaveBeenCalledExactlyOnceWith({
			diff,
			hash: hash({ version: current.directus, item: current }),
		})
		expectApplyExit(0)
	})

	it('keeps absent system fields empty in the final convergence check after ten applications', async () => {
		await writeMetadata()
		const current: Snapshot = {
			...snapshot,
			systemFields: [
				{ collection: 'directus_files', field: 'title', schema: { is_indexed: true } },
			],
		}
		mocks.service.snapshot.mockResolvedValue(current)
		for (let application = 0; application < 10; application++) {
			mocks.service.diff.mockResolvedValueOnce(diff)
		}
		mocks.service.diff.mockResolvedValueOnce(null)
		await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
			from: 'user',
		})
		expect(mocks.service.diff).toHaveBeenNthCalledWith(1, snapshot, {
			currentSnapshot: current,
			force: true,
		})
		expect(mocks.service.diff).toHaveBeenNthCalledWith(11, snapshot, {
			currentSnapshot: current,
			force: true,
		})
		expectApplyExit(0)
	})

	it.each(['diff', 'apply'])(
		'fails and cleans the marker when the %s service rejects',
		async (method) => {
			await writeMetadata()
			mocks.service.diff.mockResolvedValue(diff)
			if (method === 'diff')
				mocks.service.diff.mockRejectedValue(new Error('schema service failed'))
			else mocks.service.apply.mockRejectedValue(new Error('schema service failed'))
			await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
				from: 'user',
			})
			expectApplyExit(1)
		},
	)

	it('verifies convergence after the tenth application before deciding the exit code', async () => {
		await writeMetadata()
		mocks.service.diff.mockResolvedValue(diff)
		await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
			from: 'user',
		})
		expect(mocks.service.apply).toHaveBeenCalledTimes(10)
		expect(mocks.service.diff).toHaveBeenCalledTimes(11)
		expectApplyExit(1)

		mocks.service.apply.mockClear()
		mocks.service.diff.mockReset()
		for (let application = 0; application < 10; application++) {
			mocks.service.diff.mockResolvedValueOnce(diff)
		}
		mocks.service.diff.mockResolvedValueOnce(null)
		await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
			from: 'user',
		})
		expect(mocks.service.apply).toHaveBeenCalledTimes(10)
		expect(mocks.service.diff).toHaveBeenCalledTimes(11)
		expectApplyExit(0)
	})

	it.each(['missing metadata', 'malformed definition'])(
		'stops before diffing %s',
		async (failure) => {
			if (failure === 'malformed definition') {
				await writeMetadata()
				await writeFile(path.join(directory, 'metadata.yml'), 'version: [')
			}
			await createProgram().program.parseAsync(['schema-split', 'apply', directory], {
				from: 'user',
			})
			expect(mocks.service.diff).not.toHaveBeenCalled()
			expect(mocks.service.apply).not.toHaveBeenCalled()
			expectApplyExit(1)
		},
	)
})
