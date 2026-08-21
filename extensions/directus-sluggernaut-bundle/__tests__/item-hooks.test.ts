/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import type { HookExtensionContext } from '@directus/types'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'
import { registerSluggernautItemHooks } from '../src/sluggernaut-hook/mutation/item-hooks'

const mocks = vi.hoisted(() => ({
	collectionReadOne: vi.fn(),
	existingItemReadOne: vi.fn(),
	getSchema: vi.fn().mockResolvedValue({}),
	logger: { warn: vi.fn(), error: vi.fn() },
}))

describe('Sluggernaut item hooks', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.collectionReadOne.mockResolvedValue({ meta: null })
		mocks.existingItemReadOne.mockResolvedValue({
			title: 'Old title',
			slug: 'old-title',
			path: '/old-title',
		})
	})

	it('derives fields without querying collection metadata as an item field', async () => {
		const filters = new Map<string, (...args: unknown[]) => Promise<unknown>>()
		const hook = {
			filter: vi.fn((event: string, callback: (...args: unknown[]) => Promise<unknown>) => {
				filters.set(event, callback)
			}),
			action: vi.fn(),
		}
		const context = {
			getSchema: mocks.getSchema,
			logger: mocks.logger,
			services: {
				CollectionsService: class {
					public readOne = mocks.collectionReadOne
				},
				ItemsService: class {
					public readOne = mocks.existingItemReadOne
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
						options: { sourceFields: ['title'] },
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
			{
				database: {},
				accountability: null,
			},
		)

		expect(result).toMatchObject({ title: 'New title', slug: 'new-title', path: '/new-title' })
		expect(mocks.collectionReadOne).toHaveBeenCalledWith('articles')
		expect(mocks.existingItemReadOne).toHaveBeenCalledWith('1', {
			fields: ['slug', 'title', 'path'],
		})
	})
})
