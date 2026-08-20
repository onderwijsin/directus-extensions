import { describe, expect, it, vi } from 'vitest'

import {
	applyRedirectLifecyclePlan,
	applyRedirectPlan,
	readManagedRedirectsForItem,
	readRelevantRedirects,
} from '../src/sluggernaut-hook/redirects/service'

describe('redirect service adapter', () => {
	it('reads and parses only compatible redirect records', async () => {
		const store = {
			readByQuery: vi.fn(() =>
				Promise.resolve([
					{
						id: 1,
						origin: '/old',
						destination: '/new',
						type: 301,
						is_active: true,
						managed_by: 'sluggernaut',
						inactive_reason: null,
					},
					{ id: 'invalid', origin: '/missing-fields' },
				]),
			),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		const records = await readRelevantRedirects(store, '/old', '/new')

		expect(store.readByQuery).toHaveBeenCalledWith(expect.objectContaining({ limit: -1 }))
		expect(records).toEqual([expect.objectContaining({ id: '1', managedBy: 'sluggernaut' })])
	})

	it('applies creates, rewrites, and deactivations in order', async () => {
		const store = {
			readByQuery: vi.fn(),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await applyRedirectPlan(store, {
			create: {
				origin: '/old',
				destination: '/new',
				type: 301,
				isActive: true,
				managedBy: 'sluggernaut',
				sourceCollection: 'articles',
				sourceItem: '1',
				sourceField: 'route',
				sourceType: 'permalink',
				inactiveReason: null,
			},
			rewrite: [{ id: 'chain', destination: '/new' }],
			deactivate: [{ id: 'loop', inactiveReason: null }],
			warnings: [],
		})

		expect(store.createOne).toHaveBeenCalledOnce()
		expect(store.createOne).toHaveBeenCalledWith({
			origin: '/old',
			destination: '/new',
			type: 301,
			is_active: true,
			managed_by: 'sluggernaut',
			source_collection: 'articles',
			source_item: '1',
			source_field: 'route',
			source_type: 'permalink',
			inactive_reason: null,
		})
		expect(store.updateOne).toHaveBeenNthCalledWith(1, 'chain', { destination: '/new' })
		expect(store.updateOne).toHaveBeenNthCalledWith(2, 'loop', {
			is_active: false,
			inactive_reason: null,
		})
	})

	it('reads only managed history for a source item', async () => {
		const store = {
			readByQuery: vi.fn(() =>
				Promise.resolve([
					{
						id: 'managed',
						origin: '/old',
						destination: '/new',
						type: 301,
						is_active: false,
						managed_by: 'sluggernaut',
						source_collection: 'articles',
						source_item: '1',
						inactive_reason: 'delete',
					},
				]),
			),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await expect(readManagedRedirectsForItem(store, 'articles', '1')).resolves.toEqual([
			expect.objectContaining({ id: 'managed', inactiveReason: 'delete' }),
		])
	})

	it('applies lifecycle deactivation and reactivation updates', async () => {
		const store = {
			readByQuery: vi.fn(),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await applyRedirectLifecyclePlan(store, {
			deactivate: [{ id: 'deleted', inactiveReason: 'delete' }],
			reactivate: [{ id: 'archived', isActive: true, inactiveReason: null }],
		})

		expect(store.updateOne).toHaveBeenNthCalledWith(1, 'deleted', {
			is_active: false,
			inactive_reason: 'delete',
		})
		expect(store.updateOne).toHaveBeenNthCalledWith(2, 'archived', {
			is_active: true,
			inactive_reason: null,
		})
	})
})
