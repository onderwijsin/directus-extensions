import type { PathToContent } from '../src/shared/types'

import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	directory: '',
	afterWrite: vi.fn<(filename: unknown) => void>(),
}))

vi.mock('node:os', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:os')>()
	return { ...actual, default: { ...actual, tmpdir: () => mocks.directory } }
})
vi.mock('node:fs/promises', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs/promises')>()
	return {
		...actual,
		writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
			await actual.writeFile(...args)
			mocks.afterWrite(args[0])
		},
	}
})

import { withSnapshotLock, writeSnapshotFiles } from '../src/shared/snapshotFiles'

const files: PathToContent = {
	'metadata.yml': { version: 1, directus: '12.2.0', vendor: 'sqlite' },
	'directus_files_74498934/systemFields/title_24559c68.yml': {
		collection: 'directus_files',
		field: 'title',
		schema: { is_indexed: true },
	},
}

describe('safe snapshot publication', () => {
	let output = ''
	beforeEach(async () => {
		mocks.afterWrite.mockReset()
		mocks.directory = await mkdtemp(path.join(tmpdir(), 'schema-split-publication-'))
		output = path.join(mocks.directory, 'snapshots')
	})
	afterEach(async () => {
		await rm(mocks.directory, { recursive: true, force: true })
	})

	it('excludes another operation in the same process without releasing the owner lock', async () => {
		let enter: () => void = () => undefined
		let release: () => void = () => undefined
		const entered = new Promise<void>((resolve) => {
			enter = resolve
		})
		const finish = new Promise<void>((resolve) => {
			release = resolve
		})
		const owner = withSnapshotLock(async () => {
			enter()
			await finish
		})
		try {
			await entered
			await expect(withSnapshotLock(() => Promise.resolve())).rejects.toThrow(
				'Another schema-split',
			)
			expect(
				existsSync(path.join(mocks.directory, 'directus-schema-snapshot/operation.lock')),
			).toBe(true)
		} finally {
			release()
			await owner
		}
		await expect(withSnapshotLock(() => Promise.resolve())).resolves.toBeUndefined()
	})

	it('rejects output that would clear the coordination directory containing its own lock', async () => {
		await expect(
			withSnapshotLock(() => writeSnapshotFiles(mocks.directory, files, true)),
		).rejects.toThrow('must not contain')
	})

	it.each(['abort', 'metadata failure'])(
		'keeps interrupted output unusable after %s and permits a successful retry',
		async (failure) => {
			await withSnapshotLock(() => writeSnapshotFiles(output, files, true))
			const controller = new AbortController()
			mocks.afterWrite.mockImplementation((filename) => {
				if (typeof filename !== 'string') return
				if (failure === 'abort' && filename.includes('systemFields')) controller.abort()
				if (failure === 'metadata failure' && filename.endsWith('.metadata.yml.tmp')) {
					throw new Error('injected metadata failure')
				}
			})
			await expect(
				withSnapshotLock(() => writeSnapshotFiles(output, files, true, controller.signal)),
			).rejects.toThrow()
			expect(existsSync(path.join(output, 'metadata.yml'))).toBe(false)
			expect(existsSync(path.join(output, '.metadata.yml.tmp'))).toBe(false)
			mocks.afterWrite.mockReset()
			await withSnapshotLock(() => writeSnapshotFiles(output, files, true))
			expect(await readFile(path.join(output, 'metadata.yml'), 'utf8')).toContain(
				'version: 1',
			)
		},
	)
})
