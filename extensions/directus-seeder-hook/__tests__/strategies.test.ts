import type { ServiceAdapter } from '../src/services/ServiceAdapter'

import { describe, expect, it, vi } from 'vitest'

import { validateManagedSeedData } from '../src/lib/collectionManagement'
import { OperationMode } from '../src/lib/config'
import { createPerformanceTracker } from '../src/lib/performanceTracker'
import { createServiceAdapter } from '../src/services/ServiceAdapter'
import { createSeederStrategy } from '../src/strategies'

/**
 * Creates observable service operations without any database side effects.
 * @returns The strategy service and its spies.
 */
function createAdapter() {
	const getItems = vi.fn<ServiceAdapter['getItems']>().mockResolvedValue([])
	const createItems = vi.fn<ServiceAdapter['createItems']>().mockResolvedValue(['new'])
	const upsertItems = vi.fn<ServiceAdapter['upsertItems']>().mockResolvedValue(['old', 'new'])
	const deleteItems = vi.fn<ServiceAdapter['deleteItems']>().mockResolvedValue(['extra'])
	return {
		getItems,
		createItems,
		upsertItems,
		deleteItems,
		adapter: createServiceAdapter({ getItems, createItems, upsertItems, deleteItems }),
	}
}

describe('seed strategies', () => {
	it('insert-missing creates absent records and skips existing IDs', async () => {
		const service = createAdapter()
		service.getItems.mockResolvedValue([{ id: 'old' }])
		const data = [
			{ id: 'old', value: 'preserve' },
			{ id: 'new', value: 'insert' },
		]
		const result = await createSeederStrategy(OperationMode.INSERT_MISSING).seedCollection(
			'fixture',
			data,
			service.adapter,
			createPerformanceTracker(),
		)
		expect(service.createItems).toHaveBeenCalledExactlyOnceWith([data[1]])
		expect(service.upsertItems).not.toHaveBeenCalled()
		expect(service.deleteItems).not.toHaveBeenCalled()
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 1, deleted: 0, total: 2 })
	})

	it('insert-update upserts batches and counts existing versus new records', async () => {
		const service = createAdapter()
		service.getItems.mockResolvedValueOnce([{ id: 'old' }]).mockResolvedValueOnce([])
		const data = [{ id: 'old' }, { id: 'new' }]
		const result = await createSeederStrategy(OperationMode.INSERT_UPDATE, 1).seedCollection(
			'fixture',
			data,
			service.adapter,
			createPerformanceTracker(),
		)
		expect(service.upsertItems.mock.calls.map(([batch]) => batch)).toEqual([
			[data[0]],
			[data[1]],
		])
		expect(service.deleteItems).not.toHaveBeenCalled()
		expect(result).toMatchObject({ created: 1, updated: 1, skipped: 0 })
	})

	it('full-idempotent deletes extra IDs and preserves the legacy empty-data delete query', async () => {
		const service = createAdapter()
		service.getItems
			.mockResolvedValueOnce([{ id: 'old' }])
			.mockResolvedValueOnce([{ id: 'extra' }])
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			[{ id: 'old' }],
			service.adapter,
			createPerformanceTracker(),
		)
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith(['extra'])
		expect(result).toMatchObject({ updated: 1, deleted: 1 })
		service.getItems.mockClear().mockResolvedValue([{ id: 'extra' }])
		service.deleteItems.mockClear()
		await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			[],
			service.adapter,
			createPerformanceTracker(),
		)
		expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
			fields: ['id'],
			filter: { id: { _nin: [] } },
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith(['extra'])
	})

	it('full-idempotent combines the managed interval with seed IDs for deletion', async () => {
		const service = createAdapter()
		const seeds = [{ id: 10 }, { id: 19 }]
		service.getItems.mockResolvedValueOnce([{ id: 10 }]).mockResolvedValueOnce([{ id: 11 }])
		service.deleteItems.mockResolvedValue([11])
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			seeds,
			service.adapter,
			createPerformanceTracker(),
			{ type: 'id-range', min: 10, max: 20 },
		)
		expect(service.upsertItems).toHaveBeenCalledExactlyOnceWith(seeds)
		expect(service.getItems).toHaveBeenLastCalledWith({
			fields: ['id'],
			filter: {
				_and: [{ id: { _gte: 10 } }, { id: { _lt: 20 } }, { id: { _nin: [10, 19] } }],
			},
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith([11])
		expect(result).toMatchObject({ created: 1, updated: 1, deleted: 1 })
	})

	it.each([
		{ bounds: { max: 50000 }, filter: { _lt: 50000 } },
		{ bounds: { min: 50001 }, filter: { _gte: 50001 } },
	])(
		'keeps $bounds when deleting with empty seeds and omits an empty _nin',
		async ({ bounds, filter }) => {
			const service = createAdapter()
			await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
				'fixture',
				[],
				service.adapter,
				createPerformanceTracker(),
				{ type: 'id-range', ...bounds },
			)
			expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
				fields: ['id'],
				filter: { _and: [{ id: filter }] },
				limit: -1,
			})
			expect(service.upsertItems).not.toHaveBeenCalled()
		},
	)

	it('rejects a later out-of-range seed before processing even the first batch', async () => {
		const service = createAdapter()
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT, 1).seedCollection(
			'fixture',
			[{ id: 10 }, { id: 20 }],
			service.adapter,
			createPerformanceTracker(),
			{ type: 'id-range', min: 10, max: 20 },
		)
		expect(result.error).toContain('ID 20 outside managed ID range [10, 20)')
		expect(service.getItems).not.toHaveBeenCalled()
		expect(service.createItems).not.toHaveBeenCalled()
		expect(service.upsertItems).not.toHaveBeenCalled()
		expect(service.deleteItems).not.toHaveBeenCalled()
	})

	it('rejects invalid management instead of silently widening the range or coercing bounds', () => {
		for (const management of [
			{ type: 'id-range' },
			{ type: 'id-range', min: 20, max: 10 },
			{ type: 'id-range', min: 10, max: 10 },
			{ type: 'id-range', max: '50000' },
			{ type: 'id-range', max: Infinity },
			{ type: 'id-range', min: NaN },
			{ type: 'id-range', max: Number.MAX_SAFE_INTEGER + 1 },
			{ type: 'id-range', min: 1.5 },
			{ type: 'id-range', max: 50000, typo: 1 },
			{ type: 'unknown', max: 50000 },
			null,
		]) {
			expect(() => validateManagedSeedData('fixture', [], management)).toThrow(
				'Invalid management for collection "fixture"',
			)
		}
	})

	it('requires explicit safe integer seed IDs and respects the inclusive lower bound', () => {
		const management = { type: 'id-range', min: 10 }
		expect(validateManagedSeedData('fixture', [{ id: 10 }], management)).toEqual(management)
		expect(() => validateManagedSeedData('fixture', [{ id: 9 }], management)).toThrow(
			'ID 9 outside managed ID range',
		)
		for (const seed of [
			{},
			{ id: '10' },
			{ id: null },
			{ id: 10.5 },
			{ id: Number.MAX_SAFE_INTEGER + 1 },
			null,
		]) {
			expect(() => validateManagedSeedData('fixture', [seed], management)).toThrow(
				'requires a safe integer numeric ID',
			)
		}
	})

	it('uses upsert for an absent update-only item and retains insert-missing skips for an existing one', async () => {
		const service = createAdapter()
		const update = { id: 'operation', resolve: 'next', __isUpdateOnly: true }
		service.upsertItems.mockResolvedValue(['operation'])
		const strategy = createSeederStrategy(OperationMode.INSERT_MISSING)
		expect(
			await strategy.seedCollection(
				'directus_operations',
				[update],
				service.adapter,
				createPerformanceTracker(),
			),
		).toMatchObject({ updated: 1 })
		expect(service.upsertItems).toHaveBeenCalledExactlyOnceWith([
			{ id: 'operation', resolve: 'next' },
		])
		service.getItems.mockResolvedValue([{ id: 'operation' }])
		service.upsertItems.mockClear()
		expect(
			await strategy.seedCollection(
				'directus_operations',
				[update],
				service.adapter,
				createPerformanceTracker(),
			),
		).toMatchObject({ skipped: 1 })
		expect(service.upsertItems).not.toHaveBeenCalled()
	})

	it('retains partial progress and stops full-idempotent before deletion when an upsert fails', async () => {
		const service = createAdapter()
		service.upsertItems
			.mockResolvedValueOnce(['created'])
			.mockRejectedValueOnce(new Error('fixture failure'))
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT, 1).seedCollection(
			'fixture',
			[{ id: 'created' }, { id: 'failed' }, { id: 'unreached' }],
			service.adapter,
			createPerformanceTracker(),
		)
		expect(result).toMatchObject({ error: 'fixture failure', created: 1, deleted: 0, total: 3 })
		expect(service.upsertItems).toHaveBeenCalledTimes(2)
		expect(service.deleteItems).not.toHaveBeenCalled()
	})
})
