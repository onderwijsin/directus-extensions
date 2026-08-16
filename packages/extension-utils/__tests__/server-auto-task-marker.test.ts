import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsAutoTaskMarkerStore } from '../src/server/auto-task'

describe('createFsAutoTaskMarkerStore', () => {
	let directory: string

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-marker-'))
	})

	afterEach(async () => {
		await rm(directory, { force: true, recursive: true })
	})

	it('persists generations and clears only the matching marker', async () => {
		const store = createFsAutoTaskMarkerStore({ directory })

		const first = await store.touch('items/a', 100)
		const second = await store.touch('items/a', 200)
		expect(first).toEqual({ generation: 1, updatedAt: 100 })
		expect(second).toEqual({ generation: 2, updatedAt: 200 })
		expect(await store.get('items/a')).toEqual(second)
		expect(await store.clear('items/a', 1)).toBe(false)
		expect(await store.clear('items/a', 2)).toBe(true)
		expect(await store.get('items/a')).toBeUndefined()
	})

	it('supports safe identifiers and recovers after a released marker lock', async () => {
		const store = createFsAutoTaskMarkerStore({ directory })
		await store.touch('items/a?b', 100)
		expect(await store.get('items/a?b')).toEqual({ generation: 1, updatedAt: 100 })
		await store.clear('items/a?b', 1)
		expect(await store.touch('items/a?b', 200)).toEqual({ generation: 2, updatedAt: 200 })
	})

	it('rejects malformed markers, invalid options, and invalid timestamps', async () => {
		expect(() => createFsAutoTaskMarkerStore({ directory: ' ' })).toThrow(
			'Auto task marker directory must not be empty',
		)
		expect(() => createFsAutoTaskMarkerStore({ directory, lockTimeoutMs: 0 })).toThrow(
			'Auto task marker lockTimeoutMs must be a finite positive number',
		)

		const store = createFsAutoTaskMarkerStore({ directory })
		await expect(store.touch('items', Number.NaN)).rejects.toThrow(
			'Auto task marker time must be finite',
		)
		await mkdir(directory, { recursive: true })
		await writeFile(join(directory, 'broken.auto-task-marker.json'), '{broken')
		await expect(store.get('broken')).rejects.toThrow()
	})

	it('surfaces filesystem failures', async () => {
		const filePath = join(directory, 'not-a-directory')
		await writeFile(filePath, 'file')
		const store = createFsAutoTaskMarkerStore({ directory: filePath })

		await expect(store.touch('items', 100)).rejects.toThrow()
	})
})
