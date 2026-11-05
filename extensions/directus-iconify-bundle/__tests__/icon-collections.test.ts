import { effectScope, ref } from 'vue'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getCollections: vi.fn(), getCollection: vi.fn() }))

vi.mock('../../../packages/extension-utils/src/app/iconify/useIconifyApi', () => ({
	useIconifyApi: () => mocks,
}))

import { useIconCollections } from '../../../packages/extension-utils/src/app/iconify/useIconCollections'

describe('Iconify picker collections', () => {
	beforeEach(() => {
		mocks.getCollections.mockReset()
		mocks.getCollection.mockReset()
	})

	it('preserves configured order across batches and out-of-order responses', async () => {
		const selected = ref(['tabler', 'solar', 'mdi', 'lucide', 'ic', 'bi', 'carbon'])
		const pending = new Map<
			string,
			(data: { title: string; uncategorized: string[] }) => void
		>()
		mocks.getCollection.mockImplementation(
			(prefix: string) =>
				new Promise<{ title: string; uncategorized: string[] }>((resolve) => {
					pending.set(prefix, resolve)
				}),
		)
		const active = ref(false)
		const scope = effectScope()
		const result = scope.run(() => useIconCollections(active, selected, ref(true)))
		if (!result) throw new Error('Unable to start collection watcher')

		try {
			active.value = true
			await vi.waitFor(() => expect(pending.size).toBe(6))
			for (const prefix of selected.value.slice(0, 6).reverse()) {
				pending.get(prefix)?.({ title: prefix, uncategorized: ['home'] })
			}
			await vi.waitFor(() => expect(result.groups.value).toHaveLength(6))
			expect(result.groups.value.map((group) => group.name)).toEqual([
				'tabler',
				'solar',
				'mdi',
				'lucide',
				'ic',
				'bi',
			])
			await vi.waitFor(() => expect(pending.has('carbon')).toBe(true))
			pending.get('carbon')?.({ title: 'carbon', uncategorized: ['home'] })
			await vi.waitFor(() => expect(result.loading.value).toBe(false))
			expect(result.groups.value.map((group) => group.name)).toEqual(selected.value)
			expect(mocks.getCollections).not.toHaveBeenCalled()
		} finally {
			scope.stop()
		}
	})

	it('applies a changed collection order while the picker is open', async () => {
		mocks.getCollection.mockImplementation((prefix: string) =>
			Promise.resolve({ title: prefix, uncategorized: ['home'] }),
		)
		const active = ref(false)
		const selected = ref(['mdi', 'lucide'])
		const scope = effectScope()
		const result = scope.run(() => useIconCollections(active, selected, ref(true)))
		if (!result) throw new Error('Unable to start collection watcher')

		try {
			active.value = true
			await vi.waitFor(() =>
				expect(result.groups.value.map((group) => group.name)).toEqual(['mdi', 'lucide']),
			)
			selected.value = ['lucide', 'mdi']
			await vi.waitFor(() =>
				expect(result.groups.value.map((group) => group.name)).toEqual(['lucide', 'mdi']),
			)
		} finally {
			scope.stop()
		}
	})

	it('loads selected collections through the chosen route and includes aliases', async () => {
		mocks.getCollection.mockResolvedValue({
			title: 'Material Design Icons',
			uncategorized: ['home'],
			categories: { Navigation: ['menu', 'home'] },
			aliases: { house: 'home' },
		})
		const active = ref(false)
		const selected = ref(['mdi'])
		const useProxy = ref(false)
		const scope = effectScope()
		const result = scope.run(() => useIconCollections(active, selected, useProxy))
		if (!result) throw new Error('Unable to start collection watcher')
		active.value = true

		await vi.waitFor(() => expect(result.groups.value).toHaveLength(1))
		expect(mocks.getCollections).not.toHaveBeenCalled()
		expect(mocks.getCollection).toHaveBeenCalledWith('mdi', false)
		expect(result.groups.value[0]?.icons).toEqual(['mdi:home', 'mdi:menu', 'mdi:house'])
		expect(result.loading.value).toBe(false)
		scope.stop()
	})

	it('loads all collection prefixes when none are selected and reports failures', async () => {
		mocks.getCollections.mockResolvedValue({ mdi: {}, lucide: {} })
		mocks.getCollection.mockImplementation((prefix: string) => {
			if (prefix === 'lucide') return Promise.reject(new Error('unavailable'))
			return Promise.resolve({ title: 'Material Design Icons', uncategorized: ['home'] })
		})
		const active = ref(false)
		const scope = effectScope()
		const result = scope.run(() => useIconCollections(active, ref([]), ref(true)))
		if (!result) throw new Error('Unable to start collection watcher')
		active.value = true

		await vi.waitFor(() => expect(mocks.getCollections).toHaveBeenCalledWith(true))
		await vi.waitFor(() => expect(result.loading.value).toBe(false))
		expect(mocks.getCollections).toHaveBeenCalledWith(true)
		expect(mocks.getCollection).toHaveBeenCalledWith('mdi', true)
		expect(mocks.getCollection).toHaveBeenCalledWith('lucide', true)
		expect(result.groups.value).toEqual([
			{ name: 'Material Design Icons', icons: ['mdi:home'] },
		])
		expect(result.error.value).toBe(true)
		scope.stop()
	})
})
