import type { ServiceAdapter } from '../src/services/ServiceAdapter'

import { describe, expect, it, vi } from 'vitest'

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
