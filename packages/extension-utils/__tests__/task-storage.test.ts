import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
	createFsTaskHandlerStorage,
	createMemoryTaskHandlerStorage,
	createRedisTaskHandlerStorage,
} from '../src/server'

const mocks = vi.hoisted(() => ({
	quit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('ioredis', () => ({
	default: class RedisMock {
		public constructor(public readonly url: string) {}
		public quit = mocks.quit
	},
}))

vi.mock('@directus/memory', () => ({
	createKv: vi.fn(() => ({
		usingLock: vi.fn(),
		increment: vi.fn(),
		set: vi.fn(),
		get: vi.fn(),
		delete: vi.fn(),
	})),
}))

describe('task handler storage factories', () => {
	let directory: string | undefined

	afterEach(async () => {
		vi.clearAllMocks()
		if (directory) await rm(directory, { force: true, recursive: true })
		directory = undefined
	})

	it('creates process-local storage with a configurable default lock lease', async () => {
		let now = 100
		const storage = createMemoryTaskHandlerStorage({
			lockTimeoutMs: 10,
			now: () => now,
			tokenFactory: () => 'memory-token',
		})
		const lease = await storage.lockProvider.tryAcquire('item')
		now = 110

		expect(lease?.token).toBe('memory-token')
		expect(await lease?.renew()).toBe(false)
		await expect(storage.dispose()).resolves.toBeUndefined()
	})

	it('shares filesystem coordination and validates the common timeout option', async () => {
		const storageDirectory = await mkdtemp(join(tmpdir(), 'extension-utils-storage-'))
		directory = storageDirectory
		const storage = createFsTaskHandlerStorage({
			directory: storageDirectory,
			lockTimeoutMs: 10,
			tokenFactory: () => 'fs-token',
		})
		const marker = await storage.markerStore.touch('items', 100)
		expect(marker).toEqual({ generation: 1, updatedAt: 100 })
		expect(await storage.markerStore.clear('items', marker.generation)).toBe(true)
		await expect(storage.dispose()).resolves.toBeUndefined()
		expect(() =>
			createFsTaskHandlerStorage({ directory: storageDirectory, lockTimeoutMs: 0 }),
		).toThrow('Auto task marker lockTimeoutMs must be a finite positive number')
	})

	it('owns and disposes the shared Redis connection', async () => {
		const storage = createRedisTaskHandlerStorage({
			redisUrl: 'redis://localhost',
			namespace: 'test:tasks',
			lockTimeoutMs: 10_000,
		})

		await storage.dispose()
		expect(mocks.quit).toHaveBeenCalledOnce()
		await storage.dispose()
		expect(mocks.quit).toHaveBeenCalledOnce()
	})

	it('rejects invalid Redis storage options before creating a connection', () => {
		expect(() => createRedisTaskHandlerStorage({ redisUrl: ' ' })).toThrow(
			'Redis URL must not be empty',
		)
		expect(() =>
			createRedisTaskHandlerStorage({ redisUrl: 'redis://localhost', namespace: ' ' }),
		).toThrow('Task handler namespace must not be empty')
		expect(() =>
			createRedisTaskHandlerStorage({ redisUrl: 'redis://localhost', lockTimeoutMs: 0 }),
		).toThrow('Task handler lockTimeoutMs must be a finite positive number')
		expect(mocks.quit).not.toHaveBeenCalled()
	})
})
