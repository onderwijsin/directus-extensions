import { describe, expect, it, vi } from 'vitest'

import { processDeletedItems } from '../src/sluggernaut-hook/mutation/redirects/deletion-redirects'
import { processArchiveLifecycle } from '../src/sluggernaut-hook/mutation/redirects/lifecycle-redirects'
import {
	redirectCreateSchema,
	redirectRecordSchema,
} from '../src/sluggernaut-hook/redirects/schema'
import { createRedirectService } from '../src/sluggernaut-hook/redirects/service'

const options = {
	SLUGGERNAUT_REDIRECTS_ENABLED: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_redirects',
}

const context = {
	logger: { warn: vi.fn() },
	getSchema: vi.fn().mockResolvedValue({ schema: 1 }),
}

describe('Sluggernaut redirect boundaries', () => {
	it('accepts compatible records and rejects malformed provenance or unknown keys', () => {
		const record = redirectRecordSchema.parse({
			id: 1,
			origin: '/old',
			destination: '/new',
			start_date: '2026-01-01T00:00:00.000Z',
			end_date: null,
		})
		expect(record).toMatchObject({ type: 301, is_active: true, managed_by: null })
		expect(record.start_date).toBe('2026-01-01T00:00:00.000Z')
		expect(
			redirectRecordSchema.parse({ id: 2, origin: '/old', destination: '/new' }),
		).not.toHaveProperty('start_date')
		expect(
			redirectCreateSchema.parse({
				origin: '/old',
				destination: '/new',
				managed_by: 'sluggernaut',
				source_collection: 'entries',
				source_item: 1,
				source_field: 'route',
				source_type: 'permalink',
				inactive_reason: null,
			}),
		).toMatchObject({ type: 301, is_active: true })
		for (const value of [
			{ id: 'not-a-uuid', origin: '/old', destination: '/new' },
			{ id: 1, origin: '/old', destination: '/new', managed_by: 'other' },
			{ id: 1, origin: '/old', destination: '/new', source_type: 'route' },
			{ id: 1, origin: '/old', destination: '/new', unknown: true },
		])
			expect(redirectRecordSchema.safeParse(value).success).toBe(false)
		expect(
			redirectRecordSchema.safeParse({
				id: 1,
				origin: '/old',
				destination: '/new',
				start_date: 'not-a-date',
			}).success,
		).toBe(false)
	})

	it('constructs the configured service with awaited schema, null accountability, and transaction', async () => {
		const ItemsService = vi.fn(function () {
			return { readByQuery: vi.fn() }
		})
		const database = {} as never
		await createRedirectService(
			{ ...context, services: { ItemsService } } as never,
			'custom_redirects',
			database,
		)
		expect(ItemsService).toHaveBeenCalledWith('custom_redirects', {
			schema: { schema: 1 },
			accountability: null,
			knex: database,
		})
		expect(context.getSchema).toHaveBeenCalledOnce()
	})

	it('keeps delete and lifecycle workflows disabled without constructing redirect infrastructure', async () => {
		const disabled = { ...options, SLUGGERNAUT_REDIRECTS_ENABLED: false }
		await expect(
			processDeletedItems({
				context,
				options: disabled as never,
				collection: 'entries',
				keys: [1],
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
		await expect(
			processArchiveLifecycle({
				context,
				options: disabled as never,
				collection: 'entries',
				key: 1,
				lifecycle: 'archive',
				database: vi.fn(),
			} as never),
		).resolves.toBeUndefined()
	})
})
