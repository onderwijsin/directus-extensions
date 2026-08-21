import { describe, expect, it, vi } from 'vitest'

import {
	applyRedirectLifecyclePlan,
	applyRedirectPlan,
	readManagedRedirectsForItem,
	readRelevantRedirects,
} from '../src/sluggernaut-hook/redirects/redirect-operations'

describe('redirect operations', () => {
	it('reads and parses only compatible redirect records', async () => {
		const service = {
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

		const records = await readRelevantRedirects(service, '/old', '/new')

		expect(service.readByQuery).toHaveBeenCalledWith(expect.objectContaining({ limit: -1 }))
		expect(records).toEqual([expect.objectContaining({ id: 1, managed_by: 'sluggernaut' })])
	})

	it('applies creates, rewrites, and deactivations in order', async () => {
		const service = {
			readByQuery: vi.fn(),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await applyRedirectPlan(service, {
			create: {
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
			},
			rewrite: [{ id: 'chain', destination: '/new' }],
			deactivate: [{ id: 'loop', inactive_reason: null }],
			warnings: [],
		})

		expect(service.createOne).toHaveBeenCalledOnce()
		expect(service.createOne).toHaveBeenCalledWith({
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
		expect(service.updateOne).toHaveBeenNthCalledWith(1, 'chain', { destination: '/new' })
		expect(service.updateOne).toHaveBeenNthCalledWith(2, 'loop', {
			is_active: false,
			inactive_reason: null,
		})
	})

	it('reads only managed history for a source item', async () => {
		const service = {
			readByQuery: vi.fn(() =>
				Promise.resolve([
					{
						id: 2,
						origin: '/old',
						destination: '/new',
						type: 301,
						is_active: false,
						managed_by: 'sluggernaut',
						source_collection: 'articles',
						source_item: '1',
						source_field: 'route',
						source_type: 'permalink',
						inactive_reason: 'delete',
					},
				]),
			),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await expect(readManagedRedirectsForItem(service, 'articles', '1')).resolves.toEqual([
			expect.objectContaining({ id: 2, inactive_reason: 'delete' }),
		])
	})

	it('applies lifecycle deactivation and reactivation updates', async () => {
		const service = {
			readByQuery: vi.fn(),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await applyRedirectLifecyclePlan(service, {
			deactivate: [{ id: 'deleted', inactive_reason: 'delete' }],
			reactivate: [{ id: 'archived', is_active: true, inactive_reason: null }],
		})

		expect(service.updateOne).toHaveBeenNthCalledWith(1, 'deleted', {
			is_active: false,
			inactive_reason: 'delete',
		})
		expect(service.updateOne).toHaveBeenNthCalledWith(2, 'archived', {
			is_active: true,
			inactive_reason: null,
		})
	})
})
