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

	it('forwards exact relevant and ownership filters and ignores non-array results', async () => {
		const service = {
			readByQuery: vi.fn().mockResolvedValue(null),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}
		await expect(readRelevantRedirects(service, '/old', '/new')).resolves.toEqual([])
		expect(service.readByQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				filter: {
					_or: [{ origin: { _in: ['/old', '/new'] } }, { destination: { _eq: '/old' } }],
				},
			}),
		)
		await expect(readManagedRedirectsForItem(service, 'entries', 7)).resolves.toEqual([])
		expect(service.readByQuery).toHaveBeenLastCalledWith(
			expect.objectContaining({
				filter: {
					_and: [
						{ managed_by: { _eq: 'sluggernaut' } },
						{ source_collection: { _eq: 'entries' } },
						{ source_item: { _eq: 7 } },
					],
				},
			}),
		)
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
			reactivate: [{ id: 'reactivated' }],
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
		expect(service.updateOne).toHaveBeenNthCalledWith(2, 'reactivated', {
			is_active: true,
			inactive_reason: null,
		})
		expect(service.updateOne).toHaveBeenNthCalledWith(3, 'loop', {
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
						inactive_reason: 'deleted',
					},
				]),
			),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await expect(readManagedRedirectsForItem(service, 'articles', '1')).resolves.toEqual([
			expect.objectContaining({ id: 2, inactive_reason: 'deleted' }),
		])
	})

	it('applies lifecycle deactivation and reactivation updates', async () => {
		const service = {
			readByQuery: vi.fn(),
			createOne: vi.fn(),
			updateOne: vi.fn(),
		}

		await applyRedirectLifecyclePlan(service, {
			deactivate: [{ id: 'deleted', inactive_reason: 'deleted' }],
			reactivate: [{ id: 'archived', is_active: true, inactive_reason: null }],
		})

		expect(service.updateOne).toHaveBeenNthCalledWith(1, 'deleted', {
			is_active: false,
			inactive_reason: 'deleted',
		})
		expect(service.updateOne).toHaveBeenNthCalledWith(2, 'archived', {
			is_active: true,
			inactive_reason: null,
		})
	})

	it('stops applying later operations after the first persistence error', async () => {
		const service = {
			readByQuery: vi.fn(),
			createOne: vi.fn().mockRejectedValue(new Error('create failed')),
			updateOne: vi.fn(),
		}
		await expect(
			applyRedirectPlan(service, {
				create: {
					origin: '/old',
					destination: '/new',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'entries',
					source_item: 1,
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
					start_date: null,
					end_date: null,
				},
				rewrite: [{ id: 'later', destination: '/new' }],
				reactivate: [],
				deactivate: [],
				warnings: [],
			}),
		).rejects.toThrow('create failed')
		expect(service.updateOne).not.toHaveBeenCalled()
	})
})
