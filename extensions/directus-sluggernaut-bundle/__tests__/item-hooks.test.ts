/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import type { HookExtensionContext } from '@directus/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'
import { registerSluggernautItemHooks } from '../src/sluggernaut-hook/mutation/item-hooks'

const options = {
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirects',
	SLUGGERNAUT_REDIRECTS_ENABLED: false,
}

const fieldMetadata = [
	{ field: 'title' },
	{
		field: 'slug',
		meta: { interface: 'sluggernaut-slug', options: { sourceFields: ['title'] } },
	},
]

const legacyMocks = vi.hoisted(() => ({
	collectionReadOne: vi.fn(),
	existingItemReadOne: vi.fn(),
	getSchema: vi.fn().mockResolvedValue({}),
	logger: { warn: vi.fn(), error: vi.fn() },
}))

function register(
	registeredOptions: Record<string, unknown> = options,
	registeredContext: Record<string, unknown> = {
		logger: { warn: vi.fn(), error: vi.fn() },
	},
) {
	const filters = new Map<string, (...args: never[]) => unknown>()
	const actions = new Map<string, (...args: never[]) => unknown>()
	const hook = {
		filter: vi.fn((event: string, callback: (...args: never[]) => unknown) =>
			filters.set(event, callback),
		),
		action: vi.fn((event: string, callback: (...args: never[]) => unknown) =>
			actions.set(event, callback),
		),
	}
	const context = registeredContext
	registerSluggernautItemHooks(
		hook as never,
		context as never,
		registeredOptions as never,
		{
			read: vi.fn().mockResolvedValue(fieldMetadata),
		} as never,
	)
	return { filters, actions, context }
}

describe('Sluggernaut item hook boundary registration', () => {
	it('registers create/update/delete and redirect reactivation handlers', () => {
		const { filters, actions } = register()
		expect([...filters.keys()]).toEqual(['items.create', 'items.update'])
		expect([...actions.keys()]).toEqual(['items.delete', 'items.update'])
	})

	it('derives create payloads, ignores redirect collection writes, and rejects malformed collection keys', async () => {
		const { filters } = register()
		const create = filters.get('items.create') as unknown as (
			payload: unknown,
			meta: unknown,
			context?: unknown,
		) => Promise<unknown>
		await expect(
			create({ title: 'Hello World' }, { collection: 'entries' }),
		).resolves.toMatchObject({ title: 'Hello World', slug: 'hello-world' })
		await expect(
			create({ title: 'Hello World' }, { collection: 'redirects' }),
		).resolves.toEqual({ title: 'Hello World' })
		await expect(create({ title: 'Hello World' }, { collection: null })).rejects.toThrow(
			'collection key',
		)
		await expect(create(null, { collection: 'entries' })).resolves.toBeNull()
	})

	it('keeps unrelated update payloads untouched and rejects ambiguous update keys only when relevant', async () => {
		const { filters } = register()
		const update = filters.get('items.update') as unknown as (
			payload: unknown,
			meta: unknown,
			context?: unknown,
		) => Promise<unknown>
		const eventContext = { database: vi.fn() }
		await expect(
			update({ unrelated: true }, { collection: 'entries', keys: [1] }, eventContext),
		).resolves.toEqual({ unrelated: true })
		await expect(
			update({ title: 'New' }, { collection: 'entries', keys: [1, 2] }, eventContext),
		).rejects.toThrow('ambiguous')
	})

	it('ignores malformed delete keys without touching redirect infrastructure', async () => {
		const database = vi.fn()
		const { actions } = register(
			{ ...options, SLUGGERNAUT_REDIRECTS_ENABLED: true },
			{
				logger: { warn: vi.fn(), error: vi.fn() },
				database,
			},
		)
		const remove = actions.get('items.delete') as unknown as (meta: unknown) => Promise<void>

		await expect(
			remove({ collection: 'entries', keys: [null, {}, true] }),
		).resolves.toBeUndefined()
		expect(database).not.toHaveBeenCalled()
	})

	it('logs redirect cleanup failures after deletion without throwing', async () => {
		const error = new Error('redirect cleanup failed')
		const database = vi.fn(() => ({
			whereIn: vi.fn(() => ({ update: vi.fn().mockRejectedValue(error) })),
		}))
		const logger = { warn: vi.fn(), error: vi.fn() }
		const context = {
			logger,
			database,
			getSchema: vi.fn().mockResolvedValue({}),
			services: {
				ItemsService: vi.fn(function () {
					return {
						readByQuery: vi.fn().mockResolvedValue([
							{
								id: 1,
								origin: '/old',
								destination: '/new',
								date_created: '2025-03-17T15:19:35.672Z',
								managed_by: 'sluggernaut',
								source_collection: 'entries',
								source_item: '1',
							},
						]),
					}
				}),
			},
		}
		const { actions } = register({ ...options, SLUGGERNAUT_REDIRECTS_ENABLED: true }, context)
		const remove = actions.get('items.delete') as unknown as (meta: unknown) => Promise<void>

		await expect(remove({ collection: 'entries', keys: [1] })).resolves.toBeUndefined()
		expect(logger.error).toHaveBeenCalledWith(
			'Sluggernaut failed to process deleted items.',
			expect.objectContaining({ error }),
		)
	})

	it('clears inactive reasons only for explicit redirect reactivation', async () => {
		const update = vi.fn().mockResolvedValue(undefined)
		const database = vi.fn(() => ({ whereIn: vi.fn(() => ({ update })) }))
		const { actions } = register(
			{ ...options, SLUGGERNAUT_REDIRECTS_ENABLED: true },
			{
				logger: { warn: vi.fn(), error: vi.fn() },
			},
		)
		const reactivate = actions.get('items.update') as unknown as (
			meta: unknown,
			context: unknown,
		) => Promise<void>

		await reactivate(
			{ collection: 'redirects', keys: [1, 2], payload: { is_active: true } },
			{ database },
		)
		await reactivate(
			{ collection: 'redirects', keys: [1], payload: { is_active: false } },
			{ database },
		)
		await reactivate(
			{
				collection: 'redirects',
				keys: [1],
				payload: { is_active: true, inactive_reason: null },
			},
			{ database },
		)

		expect(update).toHaveBeenCalledOnce()
		expect(update).toHaveBeenCalledWith({ inactive_reason: null })
	})
})

describe('Sluggernaut item hook integration seams', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		legacyMocks.collectionReadOne.mockResolvedValue({ meta: null })
		legacyMocks.existingItemReadOne.mockResolvedValue({
			title: 'Old title',
			slug: 'old-title',
			path: '/old-title',
		})
	})

	it('derives fields without querying collection metadata as an item field', async () => {
		const filters = new Map<string, (...args: unknown[]) => Promise<unknown>>()
		const hook = {
			filter: vi.fn((event: string, callback: (...args: unknown[]) => Promise<unknown>) =>
				filters.set(event, callback),
			),
			action: vi.fn(),
		}
		const context = {
			getSchema: legacyMocks.getSchema,
			logger: legacyMocks.logger,
			services: {
				CollectionsService: class {
					public readOne = legacyMocks.collectionReadOne
				},
				ItemsService: class {
					public readOne = legacyMocks.existingItemReadOne
				},
			},
		} as unknown as HookExtensionContext
		const fieldReader = {
			read: vi.fn().mockResolvedValue([
				{ field: 'title' },
				{
					field: 'slug',
					meta: {
						interface: 'sluggernaut-slug',
						options: {
							sourceFields: ['title'],
							locale: 'en',
							lowercase: true,
							updateOnSourceChange: true,
							automaticRedirects: false,
						},
					},
				},
				{
					field: 'path',
					meta: {
						interface: 'sluggernaut-permalink',
						options: {
							generateFromSlug: true,
							slugField: 'slug',
							updateOnSlugChange: true,
							validatePrefixOnManualInput: false,
							trailingSlash: false,
							enforceTrailingSlashOnManualInput: false,
							automaticRedirects: false,
						},
					},
				},
			]),
			clearCache: vi.fn(),
		}
		registerSluggernautItemHooks(
			hook as never,
			context,
			envSchema.parse({ SLUGGERNAUT_REDIRECTS_ENABLED: true }),
			fieldReader,
		)
		const updateFilter = filters.get('items.update')
		if (!updateFilter) throw new Error('Expected items.update filter')
		const result = await updateFilter(
			{ title: 'New title' },
			{ collection: 'articles', keys: ['1'] },
			{ database: {}, accountability: null },
		)
		expect(result).toMatchObject({ title: 'New title', slug: 'new-title', path: '/new-title' })
		expect(legacyMocks.collectionReadOne).toHaveBeenCalledWith('articles')
		expect(legacyMocks.existingItemReadOne).toHaveBeenCalledWith('1', {
			fields: ['slug', 'title', 'path'],
		})
	})
})
