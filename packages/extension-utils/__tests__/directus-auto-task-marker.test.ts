import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createKv: vi.fn(() => {
		const markers = new Map<string, unknown>()
		const generations = new Map<string, number>()
		return {
			usingLock: vi.fn((_key: string, operation: () => Promise<unknown>) => operation()),
			increment: vi.fn((key: string) => {
				const generation = (generations.get(key) ?? 0) + 1
				generations.set(key, generation)
				return generation
			}),
			set: vi.fn((key: string, value: unknown) => void markers.set(key, value)),
			get: vi.fn((key: string) => markers.get(key)),
			delete: vi.fn((key: string) => void markers.delete(key)),
		}
	}),
	quit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@directus/memory', () => ({ createKv: mocks.createKv }))
vi.mock('ioredis', () => ({
	default: class RedisMock {
		public constructor(public readonly url: string) {}
		public quit = mocks.quit
	},
}))

import Redis from 'ioredis'

import { createRedisMarkerStore } from '../src/server/auto-task'

describe('createRedisMarkerStore', () => {
	it('increments generations and clears only the matching marker', async () => {
		const store = createRedisMarkerStore({
			redisUrl: 'redis://localhost',
			redis: new Redis('redis://localhost'),
			namespace: 'test',
		})

		const first = await store.touch('items/a', 100)
		const second = await store.touch('items/a', 200)
		expect(first).toEqual({ generation: 1, updatedAt: 100 })
		expect(second).toEqual({ generation: 2, updatedAt: 200 })
		expect(await store.get('items/a')).toEqual(second)
		expect(await store.clear('items/a', 1)).toBe(false)
		expect(await store.clear('items/a', 2)).toBe(true)
		expect(await store.get('items/a')).toBeUndefined()
	})

	it('rejects invalid timestamps and propagates KV failures', async () => {
		const store = createRedisMarkerStore({
			redisUrl: 'redis://localhost',
			redis: new Redis('redis://localhost'),
		})
		await expect(store.touch('items', Number.NaN)).rejects.toThrow(
			'Auto task marker time must be finite',
		)

		const failingStore = createRedisMarkerStore({
			redisUrl: 'redis://localhost',
			redis: new Redis('redis://localhost'),
		})
		const failingKv = mocks.createKv.mock.results.at(-1)?.value
		if (!failingKv) throw new Error('Expected a KV store')
		vi.spyOn(failingKv, 'usingLock').mockRejectedValue(new Error('KV unavailable'))
		await expect(failingStore.clear('items', 1)).rejects.toThrow('KV unavailable')
	})
})
