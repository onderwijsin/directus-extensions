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

interface HandlerEvent {
	status: 'started' | 'completed' | 'error'
	at: number
	pid: number
}

interface HandlerConfig {
	taskId: string
	eventPath: string
	debounceMs: number
	markerLeaseMs: number
	taskLeaseMs: number
	renewalIntervalMs: number
	durationMs: number
	lockTimeoutMs: number
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

	const createWorker = <Message>(
		mode: 'lock' | 'marker' | 'handler',
		config: Partial<HandlerConfig> = {},
	) => {
		const worker = createProcessWorker<Message>({
			script: workerScript,
			args: [extensionUtilsDist, mode, directory, JSON.stringify(config)],
			timeoutMs: 30_000,
		})
		workers.push(worker)
		return worker
	}

	const readEvents = async (paths: string[]): Promise<HandlerEvent[]> => {
		const contents = await Promise.all(
			paths.map(async (path) => {
				try {
					return await readFile(path, 'utf8')
				} catch {
					return ''
				}
			}),
		)
		return contents
			.flatMap((content) => content.trim().split('\n').filter(Boolean))
			.map((line) => JSON.parse(line) as HandlerEvent)
	}

	const waitForEvents = async (
		paths: string[],
		predicate: (events: HandlerEvent[]) => boolean,
	): Promise<HandlerEvent[]> => {
		const deadline = Date.now() + 5_000
		while (Date.now() < deadline) {
			const events = await readEvents(paths)
			if (predicate(events)) return events
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		return readEvents(paths)
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
		const latest = responses.find((response) => response.marker?.generation === 2)?.marker
		first.send({ op: 'get', identifier: 'events' })
		expect(await first.next()).toEqual({ ok: true, marker: latest })
	})

	it('executes one shared debounce generation and preserves a newer event', async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-process-handler-'))
		const eventPaths = [join(directory, 'first.events'), join(directory, 'second.events')]
		const config = {
			taskId: 'shared-handler',
			debounceMs: 20,
			markerLeaseMs: 1_000,
			taskLeaseMs: 1_000,
			renewalIntervalMs: 100,
			durationMs: 150,
			lockTimeoutMs: 1_000,
		}
		const first = createWorker<{ ok: boolean; type?: string }>('handler', {
			...config,
			eventPath: eventPaths[0],
		})
		const second = createWorker<{ ok: boolean; type?: string }>('handler', {
			...config,
			eventPath: eventPaths[1],
		})

		first.send({ op: 'trigger' })
		second.send({ op: 'trigger' })
		expect(await first.next()).toEqual({ ok: true, type: 'triggered' })
		expect(await second.next()).toEqual({ ok: true, type: 'triggered' })
		await waitForEvents(
			eventPaths,
			(events) => events.filter(({ status }) => status === 'started').length === 1,
		)

		first.send({ op: 'trigger' })
		expect(await first.next()).toEqual({ ok: true, type: 'triggered' })
		const events = await waitForEvents(
			eventPaths,
			(events) => events.filter(({ status }) => status === 'completed').length === 2,
		)
		const lifecycle = events
			.filter(({ status }) => status !== 'error')
			.sort((first, second) => first.at - second.at)
		expect(lifecycle.map(({ status }) => status)).toEqual([
			'started',
			'completed',
			'started',
			'completed',
		])
	})

	it('renews a real filesystem lease during a long-running task', async () => {
		directory = await mkdtemp(join(tmpdir(), 'extension-utils-process-renewal-'))
		const eventPaths = [join(directory, 'first.events'), join(directory, 'second.events')]
		const config = {
			taskId: 'renewing-handler',
			debounceMs: 20,
			markerLeaseMs: 1_000,
			taskLeaseMs: 80,
			renewalIntervalMs: 20,
			durationMs: 300,
			lockTimeoutMs: 1_000,
		}
		const first = createWorker<{ ok: boolean; type?: string }>('handler', {
			...config,
			eventPath: eventPaths[0],
		})
		const second = createWorker<{ ok: boolean; type?: string }>('handler', {
			...config,
			eventPath: eventPaths[1],
		})

		first.send({ op: 'trigger' })
		expect(await first.next()).toEqual({ ok: true, type: 'triggered' })
		await waitForEvents(eventPaths, (events) =>
			events.some(({ status }) => status === 'started'),
		)
		second.send({ op: 'trigger' })
		expect(await second.next()).toEqual({ ok: true, type: 'triggered' })

		const events = await waitForEvents(
			eventPaths,
			(events) => events.filter(({ status }) => status === 'completed').length === 2,
		)
		const lifecycle = events
			.filter(({ status }) => status !== 'error')
			.sort((first, second) => first.at - second.at)
		expect(lifecycle.map(({ status }) => status)).toEqual([
			'started',
			'completed',
			'started',
			'completed',
		])
		expect(lifecycle[2].at).toBeGreaterThanOrEqual(lifecycle[1].at)
	})
})
