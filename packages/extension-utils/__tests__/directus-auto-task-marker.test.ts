import { createKv } from '@directus/memory'
import { describe, expect, it, vi } from 'vitest'

import { createDirectusAutoTaskMarkerStore } from '../src/server/auto-task'

describe('createDirectusAutoTaskMarkerStore', () => {
	it('increments generations and clears only the matching marker', async () => {
		const store = createDirectusAutoTaskMarkerStore(createKv({ type: 'local' }), {
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
		const kv = createKv({ type: 'local' })
		const store = createDirectusAutoTaskMarkerStore(kv)
		await expect(store.touch('items', Number.NaN)).rejects.toThrow(
			'Auto task marker time must be finite',
		)

		const failingKv = createKv({ type: 'local' })
		vi.spyOn(failingKv, 'usingLock').mockRejectedValue(new Error('KV unavailable'))
		const failingStore = createDirectusAutoTaskMarkerStore(failingKv)
		await expect(failingStore.clear('items', 1)).rejects.toThrow('KV unavailable')
	})
})
