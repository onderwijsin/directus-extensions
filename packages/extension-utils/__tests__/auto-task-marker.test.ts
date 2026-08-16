import { describe, expect, it } from 'vitest'

import { createRedisAutoTaskMarkerStore, type RedisAutoTaskMarkerClient } from '../src/index.js'

describe('createRedisAutoTaskMarkerStore', () => {
	it('atomically increments generations and clears only the requested generation', async () => {
		const values = new Map<string, string>()
		const generations = new Map<string, number>()
		const client: RedisAutoTaskMarkerClient = {
			get: (key) => Promise.resolve(values.get(key) ?? null),
			eval: (script, _numberOfKeys, generationKey, markerKey, value) => {
				if (script.includes('incr')) {
					const generation = (generations.get(String(generationKey)) ?? 0) + 1
					generations.set(String(generationKey), generation)
					values.set(String(generationKey), String(generation))
					values.set(String(markerKey), `${generation}:${String(value)}`)
					return Promise.resolve(generation)
				}
				if (values.get(String(generationKey)) !== String(value)) return Promise.resolve(0)
				values.delete(String(markerKey))
				return Promise.resolve(1)
			},
		}
		const store = createRedisAutoTaskMarkerStore(client, { keyPrefix: 'test:' })

		const first = await store.touch('items/a', 100)
		const second = await store.touch('items/a', 200)
		expect(first).toEqual({ generation: 1, updatedAt: 100 })
		expect(second).toEqual({ generation: 2, updatedAt: 200 })
		expect(await store.get('items/a')).toEqual(second)
		expect(await store.clear('items/a', 1)).toBe(false)
		expect(await store.clear('items/a', 2)).toBe(true)
		expect(await store.get('items/a')).toBeUndefined()
	})

	it('rejects malformed replies, invalid timestamps, and client failures', async () => {
		const failure = new Error('redis unavailable')
		const failingClient: RedisAutoTaskMarkerClient = {
			get: () => Promise.reject(failure),
			eval: () => Promise.reject(failure),
		}
		const failingStore = createRedisAutoTaskMarkerStore(failingClient)
		await expect(failingStore.get('items')).rejects.toBe(failure)
		await expect(failingStore.touch('items', 1)).rejects.toBe(failure)

		const malformedStore = createRedisAutoTaskMarkerStore({
			get: () => Promise.resolve('broken'),
			eval: () => Promise.resolve(1),
		})
		await expect(malformedStore.get('items')).rejects.toThrow('Invalid auto-task marker')
		await expect(malformedStore.touch('items', Number.NaN)).rejects.toThrow(
			'Auto task marker time must be finite',
		)

		const invalidGenerationStore = createRedisAutoTaskMarkerStore({
			get: () => Promise.resolve(null),
			eval: () => Promise.resolve(0),
		})
		await expect(invalidGenerationStore.touch('items', 1)).rejects.toThrow(
			'Invalid auto-task marker',
		)
	})
})
