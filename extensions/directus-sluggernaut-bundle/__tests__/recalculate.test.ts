import type { CollectionConfiguration } from '../src/shared/configuration/types'

import { describe, expect, it, vi } from 'vitest'

import { coordinateMutation } from '../src/sluggernaut-hook/mutation/coordinator'
import { recalculateItem } from '../src/sluggernaut-recalculate/item'
import { recalculatePages } from '../src/sluggernaut-recalculate/pages'
import {
	primaryKeyFromFields,
	requiredItemFields,
	selectFieldKeys,
} from '../src/sluggernaut-recalculate/selection'

const configuration: CollectionConfiguration = {
	slugs: [
		{
			field: 'slug',
			sort: 1,
			options: {
				sourceFields: ['title'],
				locale: 'en',
				lowercase: true,
				updateOnSourceChange: true,
				automaticRedirects: false,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	permalinks: [
		{
			field: 'route',
			sort: 2,
			options: {
				generateFromSlug: true,
				slugField: 'slug',
				updateOnSlugChange: true,
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: false,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	warnings: [],
}

const logger = { warn: vi.fn() }

describe('Sluggernaut recalculation', () => {
	it('recalculate only the selected slug or permalink', () => {
		expect(
			coordinateMutation({
				kind: 'recalculate',
				payload: {},
				existingItem: {
					title: 'Selected New',
					slug: 'selected-old',
					route: '/manual-stable',
				},
				configuration,
				fieldKeys: new Set(['slug']),
			}).payload,
		).toEqual({ slug: 'selected-new' })
		expect(
			coordinateMutation({
				kind: 'recalculate',
				payload: {},
				existingItem: {
					title: 'Selected Permalink',
					slug: 'selected-permalink',
					route: '/stale-path',
				},
				configuration,
				fieldKeys: new Set(['route']),
			}).payload,
		).toEqual({ route: '/selected-permalink' })
	})

	it('recalculates a slug before its dependent permalink', () => {
		expect(
			coordinateMutation({
				kind: 'recalculate',
				payload: {},
				existingItem: { title: 'Dependency New', slug: null, route: null },
				configuration,
				fieldKeys: new Set(['slug', 'route']),
			}).payload,
		).toEqual({ slug: 'dependency-new', route: '/dependency-new' })
	})

	it('supports recalculating a standalone permalink without a slug', () => {
		const standaloneConfiguration: CollectionConfiguration = {
			slugs: [],
			permalinks: [
				{
					field: 'route',
					sort: 1,
					options: {
						generateFromSlug: false,
						updateOnSlugChange: false,
						validatePrefixOnManualInput: false,
						trailingSlash: false,
						enforceTrailingSlashOnManualInput: false,
						automaticRedirects: false,
					},
				},
			],
			warnings: [],
		}
		expect(
			coordinateMutation({
				kind: 'recalculate',
				payload: {},
				existingItem: { route: '/standalone-old' },
				configuration: standaloneConfiguration,
				fieldKeys: new Set(['route']),
			}).payload,
		).toEqual({})
	})

	it('uses database persistence when redirect creation is disabled', async () => {
		const update = vi.fn().mockResolvedValue(1)
		const database = vi.fn(() => ({ where: vi.fn(() => ({ update })) }))
		await expect(
			recalculateItem({
				item: { entry_id: 1, title: 'No Redirect Repair', slug: 'old' },
				primaryKey: 'entry_id',
				collection: 'entries',
				configuration,
				fieldKeys: new Set(['slug']),
				itemsService: { updateOne: vi.fn() },
				database,
				logger,
				createRedirects: false,
				redirectsEnabled: true,
			} as never),
		).resolves.toBe('updated')
		expect(update).toHaveBeenCalledWith({ slug: 'no-redirect-repair' })
	})

	it('continues page processing after a failed item', async () => {
		const processItem = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('updated')
		await expect(
			recalculatePages({
				itemsService: {
					readByQuery: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
				} as never,
				fields: ['id'],
				primaryKey: 'id',
				processItem,
			}),
		).resolves.toEqual({ processed: 2, updated: 1, skipped: 0, failed: 1 })
	})

	it('returns no work for empty and unknown field selections', () => {
		expect(
			selectFieldKeys(
				{ collection: 'entries', fields: [], createRedirects: false },
				configuration,
			),
		).toEqual(new Set())
		expect(
			selectFieldKeys(
				{ collection: 'entries', fields: ['unknown'], createRedirects: false },
				configuration,
			),
		).toEqual(new Set())
	})

	it('are no-ops for repeated recalculation and repeated import values', () => {
		const first = coordinateMutation({
			kind: 'recalculate',
			payload: {},
			existingItem: { title: 'Repeat', slug: 'repeat', route: '/repeat' },
			configuration,
		})
		const second = coordinateMutation({
			kind: 'update',
			payload: { title: 'Repeat' },
			existingItem: { title: 'Repeat', slug: 'repeat', route: '/repeat' },
			configuration,
		})
		expect(first.payload).toEqual({ slug: 'repeat', route: '/repeat' })
		expect(second.payload).toEqual({
			title: 'Repeat',
			slug: 'repeat',
		})
	})

	it('selects deduplicated fields, preserves dependency order, and finds primary keys', () => {
		expect(
			selectFieldKeys(
				{ collection: 'entries', fields: undefined, createRedirects: true },
				configuration,
			),
		).toEqual(new Set(['slug', 'route']))
		expect(
			selectFieldKeys(
				{
					collection: 'entries',
					fields: ['route', 'unknown', 'route'],
					createRedirects: true,
				},
				configuration,
			),
		).toEqual(new Set(['route']))
		expect(
			primaryKeyFromFields([
				{ field: 'entry_id', schema: { is_primary_key: true } },
				{ field: 'id', schema: null },
			]),
		).toBe('entry_id')
		expect(primaryKeyFromFields([{ field: 'title', schema: {} }])).toBe('id')
		expect(requiredItemFields('entry_id', configuration)).toEqual([
			'entry_id',
			'title',
			'slug',
			'route',
		])
	})

	it('pages through empty, short, full, and malformed responses with exact query arguments', async () => {
		const readByQuery = vi.fn()
		readByQuery
			.mockResolvedValueOnce([{ entry_id: 1 }, { entry_id: 2 }])
			.mockResolvedValueOnce([])
		const processItem = vi
			.fn()
			.mockResolvedValueOnce('updated')
			.mockResolvedValueOnce('skipped')
		await expect(
			recalculatePages({
				itemsService: { readByQuery } as never,
				fields: ['entry_id'],
				primaryKey: 'entry_id',
				processItem,
			}),
		).resolves.toEqual({ processed: 2, updated: 1, skipped: 1, failed: 0 })
		expect(readByQuery).toHaveBeenNthCalledWith(1, {
			fields: ['entry_id'],
			limit: 100,
			offset: 0,
			sort: ['entry_id'],
		})
		readByQuery.mockResolvedValueOnce(null)
		await expect(
			recalculatePages({
				itemsService: { readByQuery } as never,
				fields: [],
				primaryKey: 'id',
				processItem: vi.fn(),
			}),
		).resolves.toEqual({ processed: 0, updated: 0, skipped: 0, failed: 0 })
		const fullPage = Array.from({ length: 100 }, (_, index) => ({ entry_id: index }))
		readByQuery
			.mockReset()
			.mockResolvedValueOnce(fullPage)
			.mockResolvedValueOnce([{ entry_id: 100 }])
		const processor = vi.fn().mockResolvedValue('updated')
		await expect(
			recalculatePages({
				itemsService: { readByQuery } as never,
				fields: ['entry_id'],
				primaryKey: 'entry_id',
				processItem: processor,
			}),
		).resolves.toEqual({ processed: 101, updated: 101, skipped: 0, failed: 0 })
		expect(readByQuery).toHaveBeenNthCalledWith(2, {
			fields: ['entry_id'],
			limit: 100,
			offset: 100,
			sort: ['entry_id'],
		})
	})

	it('returns exact item outcomes for invalid items, empty updates, service mode, and database mode', async () => {
		const updateOne = vi.fn().mockResolvedValue({})
		const database = vi.fn(() => ({
			where: vi.fn(() => ({ update: vi.fn().mockResolvedValue(1) })),
		}))
		const base = {
			primaryKey: 'entry_id',
			collection: 'entries',
			configuration,
			fieldKeys: new Set(['slug']),
			itemsService: { updateOne },
			database,
			logger,
			createRedirects: true,
			redirectsEnabled: true,
		}
		expect(await recalculateItem({ ...base, item: null } as never)).toBe('failed')
		expect(await recalculateItem({ ...base, item: { entry_id: true } } as never)).toBe('failed')
		expect(
			await recalculateItem({ ...base, item: { entry_id: 1, title: 'Hello' } } as never),
		).toBe('updated')
		expect(updateOne).toHaveBeenCalledWith(1, { slug: 'hello' })
		expect(
			await recalculateItem({
				...base,
				item: { entry_id: 1, title: 'Hello', slug: 'hello' },
			} as never),
		).toBe('skipped')
		expect(
			await recalculateItem({
				...base,
				item: { entry_id: 2, title: 'World' },
				createRedirects: false,
			} as never),
		).toBe('updated')
		expect(database).toHaveBeenCalledWith('entries')
		const failedDatabase = vi.fn(() => ({
			where: vi.fn(() => ({
				update: vi.fn().mockRejectedValue(new Error('database failed')),
			})),
		}))
		expect(
			await recalculateItem({
				...base,
				item: { entry_id: 3, title: 'Again' },
				createRedirects: false,
				database: failedDatabase,
			} as never),
		).toBe('failed')
		expect(logger.warn).toHaveBeenCalledWith(
			'Sluggernaut failed to recalculate an item.',
			expect.objectContaining({
				item: '3',
				error: 'database failed',
				code: 'recalculate-item-failed',
			}),
		)
		const nonErrorLogger = { warn: vi.fn() }
		const failedService = vi.fn().mockRejectedValue({ reason: 'unavailable' })
		expect(
			await recalculateItem({
				...base,
				item: { entry_id: 4, title: 'Again' },
				itemsService: { updateOne: failedService },
				logger: nonErrorLogger,
			} as never),
		).toBe('failed')
		expect(nonErrorLogger.warn).toHaveBeenCalledWith(
			'Sluggernaut failed to recalculate an item.',
			expect.objectContaining({ item: '4', code: 'recalculate-item-failed' }),
		)
	})

	it('continues after a processor failure and propagates page-reader failures', async () => {
		const processItem = vi.fn().mockRejectedValueOnce(new Error('bad item'))
		await expect(
			recalculatePages({
				itemsService: { readByQuery: vi.fn().mockResolvedValue([{ id: 1 }]) } as never,
				fields: ['id'],
				primaryKey: 'id',
				processItem,
			}),
		).rejects.toThrow('bad item')
	})
})
