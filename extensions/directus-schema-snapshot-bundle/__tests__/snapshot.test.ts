import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { dump } from 'js-yaml'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/shared/env.schema'
import { fromPathsToSnapshot } from '../src/shared/fromPathsToSnapshot'
import { fromSnapshotToPathToContent } from '../src/shared/fromSnapshotToPathToContent'
import { getAllFilePaths } from '../src/shared/getAllFilePaths'
import { terminate } from '../src/shared/terminate'

const logger = pino({ level: 'silent' })
const files = {
	'metadata.yml': { version: 1, directus: '12.2.0', vendor: 'sqlite' },
	'articles_0b4dad54/articles_0b4dad54.yml': {
		collection: 'Articles',
		schema: { name: 'Articles' },
		meta: null,
	},
	'articles_1f8b5c94/articles_1f8b5c94.yml': {
		collection: 'articles',
		schema: { name: 'articles' },
		meta: null,
	},
	'group_6fdf7ca0/group_6fdf7ca0.yml': {
		collection: 'Group',
		schema: null,
		meta: { collection: 'Group', hidden: false, group: null },
	},
	'articles_0b4dad54/fields/id_adaf65f6.yml': {
		collection: 'Articles',
		field: 'ID',
		type: 'integer',
		schema: null,
		meta: null,
	},
	'articles_0b4dad54/fields/recipients_e3218567.yml': {
		collection: 'Articles',
		field: 'recipients',
		type: 'alias',
		meta: { interface: 'list-o2m' },
	},
	'articles_0b4dad54/relations/author_bfc19846.yml': {
		collection: 'Articles',
		field: 'author',
		related_collection: 'Authors',
		schema: null,
		meta: null,
	},
}
let directory = ''
const originalExitCode = process.exitCode

/**
 * Writes a real split snapshot without depending on the writer under test.
 * @returns A promise that resolves after the fixture files are written.
 */
async function writeSplitFiles() {
	for (const [relativePath, content] of Object.entries(files)) {
		const filename = path.join(directory, relativePath)
		await mkdir(path.dirname(filename), { recursive: true })
		await writeFile(filename, dump(content, { noRefs: true }))
	}
}

describe('split snapshot format and configuration', () => {
	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), 'schema-split-format-'))
	})

	afterEach(async () => {
		vi.restoreAllMocks()
		vi.unstubAllEnvs()
		process.exitCode = originalExitCode
		await rm(directory, { recursive: true, force: true })
	})

	it('roundtrips hashed paths and native aliases without schema, including case-only names and collection folders', async () => {
		await writeSplitFiles()
		const snapshot = await fromPathsToSnapshot(await getAllFilePaths(directory), logger)
		expect(snapshot.systemFields).toEqual([])
		expect(snapshot.collections).toContainEqual(files['group_6fdf7ca0/group_6fdf7ca0.yml'])
		expect(fromSnapshotToPathToContent(snapshot, logger)).toEqual(files)
	})

	it('ignores unrecognized files without interpreting their contents as schema', async () => {
		await writeSplitFiles()
		await writeFile(path.join(directory, 'notes.md'), 'not valid YAML: [')
		const snapshot = await fromPathsToSnapshot(await getAllFilePaths(directory), logger)
		expect(fromSnapshotToPathToContent(snapshot, logger)).toEqual(files)
	})

	it('rejects collection names that could escape or create nested snapshot paths', async () => {
		await writeSplitFiles()
		const snapshot = await fromPathsToSnapshot(await getAllFilePaths(directory), logger)
		for (const collection of ['../outside', 'nested/name', 'nested\\name', '.', '..']) {
			expect(() =>
				fromSnapshotToPathToContent(
					{ ...snapshot, collections: [{ collection, schema: null, meta: null }] },
					logger,
				),
			).toThrow()
		}
	})

	it.each(['field: [', 'collection: Articles\ntype: integer\nschema: null\nmeta: null\n'])(
		'rejects a malformed recognized field instead of returning a partial schema',
		async (content) => {
			await writeSplitFiles()
			await writeFile(
				path.join(directory, 'articles_0b4dad54/fields/id_adaf65f6.yml'),
				content,
			)
			await expect(
				fromPathsToSnapshot(await getAllFilePaths(directory), logger),
			).rejects.toThrow()
		},
	)

	it('rejects a snapshot with absent root metadata', async () => {
		await writeSplitFiles()
		await rm(path.join(directory, 'metadata.yml'))
		await expect(fromPathsToSnapshot(await getAllFilePaths(directory), logger)).rejects.toThrow(
			/metadata/iu,
		)
	})

	it('normalizes snapshot folder defaults and boolean environment values', () => {
		expect(envSchema.parse({}).SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER).toBe(
			'/directus/snapshots',
		)
		expect(
			envSchema.parse({ SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: '  /tmp/schema  ' })
				.SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER,
		).toBe('/tmp/schema')
		for (const value of ['', '   ', false, 1]) {
			expect(
				envSchema.parse({ SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: value })
					.SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER,
			).toBe('/directus/snapshots')
		}
		for (const value of [true, 'true', 'TRUE', '1']) {
			expect(
				envSchema.parse({ SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: value })
					.SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT,
			).toBe(true)
		}
		for (const value of [undefined, false, 'false', '0', ' true ', 1]) {
			expect(
				envSchema.parse({ SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: value })
					.SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT,
			).toBe(false)
		}
	})

	it('hard-exits by default while retaining the soft-exit environment override', () => {
		const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit intercepted')
		})
		vi.stubEnv('SCHEMA_SPLIT_HARD_EXIT', undefined)
		expect(() => terminate(1)).toThrow('exit intercepted')
		expect(exit).toHaveBeenCalledWith(1)
		exit.mockClear()
		vi.stubEnv('SCHEMA_SPLIT_HARD_EXIT', 'false')
		terminate(1)
		expect(exit).not.toHaveBeenCalled()
		expect(process.exitCode).toBe(1)
		expect(() => terminate(0, { hardExit: true })).toThrow('exit intercepted')
	})
})
