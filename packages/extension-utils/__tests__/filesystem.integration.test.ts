import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { createProcessWorker } from '../../test-utils/src'

interface LockResponse {
	ok: boolean
	acquired?: boolean
	released?: boolean
	token?: string | null
}

interface MarkerResponse {
	ok: boolean
	marker?: { generation: number; updatedAt: number }
}

const workerScript = fileURLToPath(new URL('./fixtures/process-worker.mjs', import.meta.url))
const extensionUtilsDist = fileURLToPath(new URL('../dist/server/index.js', import.meta.url))

describe('filesystem coordination across processes', () => {
	let directory: string
	const workers: { terminate: () => Promise<void> }[] = []

	afterEach(async () => {
		await Promise.all(workers.splice(0).map((worker) => worker.terminate()))
		if (directory) await rm(directory, { force: true, recursive: true })
	})

	const createWorker = <Message>(mode: 'lock' | 'marker') => {
		const worker = createProcessWorker<Message>({
			script: workerScript,
			args: [extensionUtilsDist, mode, directory],
			timeoutMs: 30_000,
		})
		workers.push(worker)
		return worker
	}

	it('does not let a late owner release a replacement lock', async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-process-lock-'))
		const first = createWorker<LockResponse>('lock')
		const second = createWorker<LockResponse>('lock')

		first.send({ op: 'acquire', name: 'replacement', leaseMs: 50 })
		expect(await first.next()).toMatchObject({
			ok: true,
			acquired: true,
			token: expect.any(String),
		})
		await new Promise((resolve) => setTimeout(resolve, 100))

		second.send({ op: 'acquire', name: 'replacement', leaseMs: 1000 })
		expect(await second.next()).toMatchObject({
			ok: true,
			acquired: true,
			token: expect.any(String),
		})
		first.send({ op: 'release' })
		expect(await first.next()).toEqual({ ok: true, released: false })
		expect(await readFile(join(directory, 'replacement.lock'), 'utf8')).not.toBe('')

		second.send({ op: 'release' })
		expect(await second.next()).toEqual({ ok: true, released: true })
	})

	it('recovers a lock after the owning process exits', async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-process-lock-'))
		const first = createWorker<LockResponse>('lock')
		first.send({ op: 'acquire', name: 'crashed', leaseMs: 50 })
		expect(await first.next()).toMatchObject({ ok: true, acquired: true })
		await first.terminate()
		await new Promise((resolve) => setTimeout(resolve, 100))

		const second = createWorker<LockResponse>('lock')
		second.send({ op: 'acquire', name: 'crashed', leaseMs: 1000 })
		expect(await second.next()).toMatchObject({ ok: true, acquired: true })
	})

	it('serializes marker generations across processes', async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-process-marker-'))
		const first = createWorker<MarkerResponse>('marker')
		const second = createWorker<MarkerResponse>('marker')

		first.send({ op: 'touch', identifier: 'events', updatedAt: 1 })
		second.send({ op: 'touch', identifier: 'events', updatedAt: 2 })
		const responses = await Promise.all([first.next(), second.next()])

		expect(
			responses.map((response) => response.marker?.generation ?? 0).sort((a, b) => a - b),
		).toEqual([1, 2])
		first.send({ op: 'get', identifier: 'events' })
		expect(await first.next()).toEqual({ ok: true, marker: { generation: 2, updatedAt: 2 } })
	})
})
