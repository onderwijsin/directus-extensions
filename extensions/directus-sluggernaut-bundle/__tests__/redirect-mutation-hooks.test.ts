import type { EventContext, HookExtensionContext } from '@directus/types'
import type { Redirect } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it, vi } from 'vitest'

import {
	registerDirectExactRedirectHooks,
	validateDirectRedirectMutation,
} from '../src/sluggernaut-hook/redirects/direct-mutations/exact'
import { withMutationSource } from '../src/sluggernaut-hook/redirects/direct-mutations/mutation-source'

const options = {
	SLUGGERNAUT_REDIRECTS_ENABLED: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_redirects',
} as const

const eventContext = {
	database: { transaction: vi.fn() },
	accountability: null,
} as never as EventContext

function setup(records: Record<string, unknown>[] = [], maxDepth = 25) {
	const readOne = vi.fn().mockResolvedValue(records[0])
	const readByQuery = vi.fn().mockResolvedValue(records)
	const ItemsService = vi.fn(function () {
		return { readOne, readByQuery }
	})
	const context = {
		getSchema: vi.fn().mockResolvedValue({ collections: {}, relations: [] }),
		services: { ItemsService },
	} as never as HookExtensionContext
	const filters = new Map<string, (...args: unknown[]) => Promise<unknown>>()
	registerDirectExactRedirectHooks(
		{
			filter: (event: string, callback: (...args: unknown[]) => Promise<unknown>) =>
				filters.set(event, callback),
		} as never,
		context,
		{ ...options, SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: maxDepth } as never,
	)
	return { context, filters, ItemsService, readOne, readByQuery }
}

const exact = (origin: string, destination: string, id = 1, is_active = true) => ({
	id,
	origin,
	destination,
	match: 'exact',
	is_active,
})

describe('direct exact redirect mutation hooks', () => {
	it('registers configured collection filters and ignores other collections', async () => {
		const { filters, ItemsService } = setup()
		const create = filters.get('items.create')!
		await expect(
			create({ origin: '/a' }, { collection: 'other' }, eventContext),
		).resolves.toEqual({
			origin: '/a',
		})
		expect(ItemsService).not.toHaveBeenCalled()
	})

	it('does not read an existing record for create and validates the initial batched frontier', async () => {
		const { filters, ItemsService, readByQuery } = setup()
		readByQuery.mockResolvedValueOnce([exact('/b', '/c', 2)]).mockResolvedValueOnce([])
		const create = filters.get('items.create')!
		await create(
			{ origin: '/a', destination: '/b', match: 'exact', is_active: true },
			{ collection: 'custom_redirects' },
			eventContext,
		)
		expect(ItemsService).toHaveBeenCalledOnce()
		expect(readByQuery).toHaveBeenCalledTimes(2)
		expect(readByQuery.mock.calls[0]?.[0].filter._and[2].origin._in).toEqual(['/a', '/b'])
		expect(readByQuery.mock.calls[1]?.[0].filter._and[2].origin._in).toEqual(['/c'])
	})

	it('persists normalized origin and internal destination paths', async () => {
		const context = setup()
		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: {
					origin: '/legacy//article',
					destination: '/articles//current',
					match: 'exact',
					is_active: true,
				},
			}),
		).resolves.toMatchObject({ origin: '/legacy/article', destination: '/articles/current' })
	})

	it('rejects a graph that exceeds the configured expansion depth', async () => {
		const { filters, readByQuery } = setup([exact('/b', '/c', 2)], 1)
		readByQuery.mockResolvedValueOnce([exact('/b', '/c', 2)])
		const create = filters.get('items.create')!

		await expect(
			create(
				{ origin: '/a', destination: '/b', match: 'exact', is_active: true },
				{ collection: 'custom_redirects' },
				eventContext,
			),
		).rejects.toThrow('maximum depth of 1')
		expect(readByQuery).toHaveBeenCalledOnce()
	})

	it('reads the target once, materializes omitted/null/falsey fields, and skips graph reads for operations', async () => {
		const { filters, readOne, readByQuery } = setup([
			{
				...exact('/a', '/b'),
				managed_by: 'sluggernaut',
				start_date: 'tomorrow',
				is_active: true,
			},
		])
		const update = filters.get('items.update')!
		await expect(
			update(
				{ is_active: false },
				{ collection: 'custom_redirects', keys: [1] },
				eventContext,
			),
		).resolves.toEqual({ is_active: false })
		expect(readOne).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ fields: expect.any(Array) }),
		)
		expect(readByQuery).not.toHaveBeenCalled()
	})

	it('transfers external structural edits but preserves ownership for operational and internal edits', async () => {
		const existing: Redirect = {
			...exact('/a', '/b'),
			match: 'exact',
			type: 301,
			specificity: null,
			matcher_signature: null,
			start_date: null,
			end_date: null,
			managed_by: 'sluggernaut',
			source_collection: 'pages',
			source_item: 1,
			source_field: 'route',
			source_type: 'permalink',
			inactive_reason: null,
			user_created: null,
			date_created: '2025-01-01T00:00:00.000Z',
			user_updated: null,
			date_updated: null,
		}
		const context = setup([existing])
		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { destination: '/c' },
				existing,
			}),
		).resolves.toMatchObject({ destination: '/c', managed_by: null, source_item: null })
		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { is_active: false },
				existing,
			}),
		).resolves.toEqual({ is_active: false })
		await expect(
			withMutationSource('internal', () =>
				validateDirectRedirectMutation({
					context: context.context,
					collection: 'custom_redirects',
					eventContext,
					payload: { destination: '/c' },
					existing,
				}),
			),
		).resolves.toEqual({ destination: '/c' })
	})

	it('does not traverse external destinations or inactive records', async () => {
		const external = setup()
		await validateDirectRedirectMutation({
			context: external.context,
			collection: 'custom_redirects',
			eventContext,
			payload: {
				origin: '/a',
				destination: 'https://example.com',
				match: 'exact',
				is_active: true,
			},
		})
		expect(external.readByQuery).toHaveBeenCalledTimes(1)
		expect(external.readByQuery.mock.calls[0]?.[0].filter._and[2].origin._in).toEqual(['/a'])

		const inactive = setup()
		await validateDirectRedirectMutation({
			context: inactive.context,
			collection: 'custom_redirects',
			eventContext,
			payload: { origin: '/a', destination: '/b', match: 'exact', is_active: false },
		})
		expect(inactive.ItemsService).not.toHaveBeenCalled()
	})

	it('translates duplicate and cycle failures into Directus payload errors', async () => {
		const duplicate = setup([exact('/a', '/c', 2)])
		await expect(
			validateDirectRedirectMutation({
				context: duplicate.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { origin: '/a', destination: '/b', match: 'exact', is_active: true },
			}),
		).rejects.toThrow(/Multiple active exact redirects/)

		const cycle = setup([exact('/b', '/a', 2)])
		await expect(
			validateDirectRedirectMutation({
				context: cycle.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { origin: '/a', destination: '/b', match: 'exact', is_active: true },
			}),
		).rejects.toThrow(/cycle/)
	})
})
