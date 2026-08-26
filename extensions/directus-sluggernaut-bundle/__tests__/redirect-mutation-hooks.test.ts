import type { EventContext, HookExtensionContext } from '@directus/types'
import type { Redirect } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it, vi } from 'vitest'

import {
	registerDirectRedirectHooks,
	validateDirectRedirectMutation,
} from '../src/sluggernaut-hook/redirects/direct-mutations/exact'
import { withMutationSource } from '../src/sluggernaut-hook/redirects/direct-mutations/mutation-source'
import { derivePatternMetadata } from '../src/sluggernaut-hook/redirects/patterns'

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
	const updateOne = vi.fn()
	const updateMany = vi.fn()
	const ItemsService = vi.fn(function () {
		return { readOne, readByQuery, updateOne, updateMany }
	})
	const context = {
		getSchema: vi.fn().mockResolvedValue({ collections: {}, relations: [] }),
		services: { ItemsService },
	} as never as HookExtensionContext
	const filters = new Map<string, (...args: unknown[]) => Promise<unknown>>()
	registerDirectRedirectHooks(
		{
			filter: (event: string, callback: (...args: unknown[]) => Promise<unknown>) =>
				filters.set(event, callback),
		} as never,
		context,
		{ ...options, SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: maxDepth } as never,
	)
	return { context, filters, ItemsService, readOne, readByQuery, updateOne, updateMany }
}

const exact = (origin: string, destination: string, id = 1, is_active = true) => ({
	id,
	origin,
	destination,
	match: 'exact',
	is_active,
})

const pattern = (origin: string, destination: string, id = 1, is_active = true): Redirect => ({
	id,
	origin,
	destination,
	type: 301,
	match: 'pattern',
	specificity: '1',
	matcher_signature: 'signature',
	is_active,
	start_date: null,
	end_date: null,
	managed_by: null,
	source_collection: null,
	source_item: null,
	source_field: null,
	source_type: null,
	inactive_reason: null,
	user_created: null,
	date_created: '2025-01-01T00:00:00.000Z',
	user_updated: null,
	date_updated: null,
})

describe('direct exact redirect mutation hooks', () => {
	it('validates pattern creates and derives metadata while clearing ownership fields', async () => {
		const context = setup()
		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: {
					origin: '//legacy///:slug',
					destination: '/articles//:slug',
					match: 'pattern',
					managed_by: 'sluggernaut',
					source_collection: 'pages',
					source_item: 1,
					source_field: 'route',
					source_type: 'permalink',
				},
			}),
		).resolves.toMatchObject({
			origin: '/legacy/:slug',
			destination: '/articles/:slug',
			match: 'pattern',
			specificity: expect.stringMatching(/^\d+$/u),
			matcher_signature: expect.any(String),
			managed_by: null,
			source_collection: null,
		})
	})

	it('rejects unsafe pattern destination captures before persistence', async () => {
		const context = setup()
		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: {
					origin: '/legacy/:slug',
					destination: '/articles/:id',
					match: 'pattern',
				},
			}),
		).rejects.toThrow(/unknown parameter/u)
	})

	it('rejects an active pattern equivalent to an existing active pattern', async () => {
		const matcher_signature = derivePatternMetadata(
			'/News/:id',
			'/articles/:id',
		).matcher_signature
		const existing = { ...pattern('/News/:id', '/articles/:id', 2), matcher_signature }
		const { filters } = setup([existing])
		const create = filters.get('items.create')!

		await expect(
			create(
				{ origin: '/news/:slug', destination: '/articles/:slug', match: 'pattern' },
				{ collection: 'custom_redirects' },
				eventContext,
			),
		).rejects.toThrow(/already uses matcher signature/u)
	})

	it('checks equivalent patterns again when an inactive pattern is reactivated', async () => {
		const matcher_signature = derivePatternMetadata(
			'/foo/:id',
			'/articles/:id',
		).matcher_signature
		const target = { ...pattern('/foo/:slug', '/articles/:slug', 1, false), matcher_signature }
		const conflict = { ...pattern('/foo/:id', '/articles/:id', 2), matcher_signature }
		const { filters } = setup([target, conflict])
		const update = filters.get('items.update')!

		await expect(
			update(
				{ is_active: true },
				{ collection: 'custom_redirects', keys: [1] },
				eventContext,
			),
		).rejects.toThrow(/already uses matcher signature/u)
	})

	it.each([
		{ origin: null, destination: '/articles/:slug' },
		{ origin: 42, destination: '/articles/:slug' },
		{ origin: '/legacy/:slug', destination: null },
		{ origin: '/legacy/:slug', destination: 42 },
	])('rejects non-string pattern path values before persistence: %o', async (values) => {
		const { filters } = setup()
		const create = filters.get('items.create')!

		await expect(
			create(
				{ ...values, match: 'pattern' },
				{ collection: 'custom_redirects' },
				eventContext,
			),
		).rejects.toThrow(/requires string origin and destination/u)
	})

	it.each([{ match: null }, { match: 'regex' }, { match: 42 }])(
		'rejects unsupported match values before persistence: %o',
		async ({ match }) => {
			const { filters } = setup()
			const create = filters.get('items.create')!

			await expect(
				create(
					{ origin: '/legacy/:slug', destination: '/articles/:slug', match },
					{ collection: 'custom_redirects' },
					eventContext,
				),
			).rejects.toThrow(/match must be either/u)
		},
	)

	it('treats pattern-looking origins as literal when match is omitted', async () => {
		const { filters } = setup()
		const create = filters.get('items.create')!

		await expect(
			create(
				{ origin: '/legacy/:slug', destination: '/articles/:slug' },
				{ collection: 'custom_redirects' },
				eventContext,
			),
		).resolves.toMatchObject({
			origin: '/legacy/:slug',
			destination: '/articles/:slug',
		})
	})

	it('rejects a pattern that exceeds the lossless specificity segment limit', async () => {
		const { filters } = setup()
		const create = filters.get('items.create')!
		const origin = `/${Array.from({ length: 21 }, (_, index) =>
			index === 20 ? ':slug' : 'static',
		).join('/')}`

		await expect(
			create(
				{ origin, destination: '/articles/:slug', match: 'pattern' },
				{ collection: 'custom_redirects' },
				eventContext,
			),
		).rejects.toThrow(/at most 20 segments/u)
	})

	it('recomputes metadata and clears provenance when updating a pattern', async () => {
		const existing = {
			...pattern('/legacy/:slug', '/articles/:slug'),
			managed_by: 'sluggernaut' as const,
			source_collection: 'pages',
			source_item: 1,
			source_field: 'route',
			source_type: 'permalink' as const,
		}
		const context = setup([existing])

		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { origin: '/new/:slug', destination: '/docs/:slug' },
				existing,
			}),
		).resolves.toMatchObject({
			origin: '/new/:slug',
			destination: '/docs/:slug',
			specificity: expect.stringMatching(/^\d+$/u),
			matcher_signature: expect.any(String),
			managed_by: null,
			source_collection: null,
		})
	})

	it('replaces caller-supplied pattern metadata with derived values on operational updates', async () => {
		const existing = pattern('/legacy/:slug', '/articles/:slug')
		const context = setup([existing])

		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: { is_active: false, specificity: 'unsafe', matcher_signature: 'unsafe' },
				existing,
			}),
		).resolves.toMatchObject({
			is_active: false,
			specificity: expect.stringMatching(/^\d+$/u),
			matcher_signature: expect.any(String),
		})
	})

	it('supports exact-to-pattern transitions with fresh metadata', async () => {
		const existing: Redirect = {
			...pattern('/legacy/slug', '/articles/slug'),
			match: 'exact',
			specificity: null,
			matcher_signature: null,
		}
		const context = setup([existing])

		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: {
					origin: '/legacy/:slug',
					destination: '/articles/:slug',
					match: 'pattern',
				},
				existing,
			}),
		).resolves.toMatchObject({
			match: 'pattern',
			specificity: expect.stringMatching(/^\d+$/u),
			matcher_signature: expect.any(String),
		})
	})

	it('supports pattern-to-exact transitions and clears derived metadata', async () => {
		const existing = pattern('/legacy/:slug', '/articles/:slug')
		const context = setup([existing])

		await expect(
			validateDirectRedirectMutation({
				context: context.context,
				collection: 'custom_redirects',
				eventContext,
				payload: {
					origin: '/legacy/slug',
					destination: '/articles/slug',
					match: 'exact',
				},
				existing,
			}),
		).resolves.toMatchObject({
			match: 'exact',
			origin: '/legacy/slug',
			specificity: null,
			matcher_signature: null,
		})
	})

	it('rejects bulk pattern updates whose targets would receive different metadata', async () => {
		const records = [
			{ ...exact('/legacy/:slug', '/articles/:slug', 1), match: 'pattern' },
			{ ...exact('/other/:slug', '/articles/:slug', 2), match: 'pattern' },
		]
		const { filters } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/articles/:slug' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/identical matcher metadata/u)
	})

	it('rejects equivalent active patterns within one bulk mutation set', async () => {
		const records = [
			pattern('/legacy/:slug', '/articles/:slug', 1),
			pattern('/legacy/:other', '/articles/:other', 2),
		]
		const { filters } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/docs' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/Multiple active patterns/u)
	})

	it('rejects caller-supplied derived metadata in bulk pattern updates', async () => {
		const { filters } = setup([
			pattern('/legacy/:slug', '/articles/:slug', 1),
			pattern('/other/:slug', '/articles/:slug', 2),
		])
		const update = filters.get('items.update')!

		await expect(
			update(
				{ specificity: '999', matcher_signature: 'forged' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/system-derived/u)
	})

	it('rejects bulk matcher updates that mix exact and pattern targets', async () => {
		const records = [pattern('/legacy/:slug', '/articles/:slug', 1), exact('/old', '/new', 2)]
		const { filters } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/docs/:slug' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/mix pattern and exact/u)
	})

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

	it.each([
		['missing keys', []],
		['invalid keys', [null]],
	] as const)('rejects update events with %s', async (_label, keys) => {
		const { filters, ItemsService } = setup()
		const update = filters.get('items.update')!

		await expect(
			update({ type: 302 }, { collection: 'custom_redirects', keys }, eventContext),
		).rejects.toThrow(/item key/)
		expect(ItemsService).not.toHaveBeenCalled()
	})

	it('preflights every updateMany target with one complete materialization', async () => {
		const records = [
			{
				...exact('/a', '/b', 1),
				type: 301,
				start_date: 'tomorrow',
				managed_by: 'sluggernaut',
			},
			{ ...exact('/c', '/d', 2), type: 307, start_date: 'next week' },
		]
		const { filters, ItemsService, readByQuery } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ is_active: false, type: 302 },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).resolves.toMatchObject({
			is_active: false,
			type: 302,
			managed_by: null,
			source_collection: null,
		})

		expect(readByQuery).toHaveBeenCalledOnce()
		expect(readByQuery.mock.calls[0]?.[0]).toMatchObject({
			filter: { id: { _in: [1, 2] } },
			limit: -1,
		})
		expect(ItemsService).toHaveBeenCalledWith(
			'custom_redirects',
			expect.objectContaining({ knex: eventContext.database, accountability: null }),
		)
	})

	it('reads only targeted records first, then expands through non-targeted records and absent origins', async () => {
		const targets = [exact('/a', '/old', 1), exact('/c', '/old', 2)]
		const nonTargeted = exact('/target', '/end', 3)
		const { filters, readByQuery } = setup(targets)
		readByQuery
			.mockResolvedValueOnce(targets)
			.mockResolvedValueOnce([nonTargeted])
			.mockResolvedValueOnce([])
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/target' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).resolves.toMatchObject({ destination: '/target' })
		expect(readByQuery).toHaveBeenCalledTimes(3)
		expect(readByQuery.mock.calls[0]?.[0]).toMatchObject({
			filter: { id: { _in: [1, 2] } },
		})
		expect(readByQuery.mock.calls[1]?.[0].filter._and[2].origin._in).toEqual(
			expect.arrayContaining(['/a', '/c', '/target']),
		)
		expect(readByQuery.mock.calls[2]?.[0].filter._and[2].origin._in).toEqual(['/end'])
	})

	it('rejects duplicate origins introduced within one updateMany mutation', async () => {
		const records = [exact('/a', '/b', 1), exact('/c', '/d', 2)]
		const { filters, readByQuery, updateOne, updateMany } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ origin: '/same', destination: '/target' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/Multiple active exact candidates/)
		expect(readByQuery).toHaveBeenCalledTimes(2)
		expect(updateOne).not.toHaveBeenCalled()
		expect(updateMany).not.toHaveBeenCalled()
	})

	it('rejects self-loops formed by updateMany candidates before persistence', async () => {
		const records = [exact('/a', '/old', 1), exact('/b', '/old', 2)]
		const { filters, readByQuery } = setup(records)
		const update = filters.get('items.update')!
		readByQuery.mockResolvedValueOnce(records).mockResolvedValueOnce(records)

		await expect(
			update(
				{ destination: '/b' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/point to itself/)
		expect(readByQuery).toHaveBeenCalledOnce()
	})

	it('rejects a bulk update when a target cannot be resolved', async () => {
		const { filters, readByQuery } = setup([exact('/a', '/b', 1)])
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/c' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/target "2" was not found/)
		expect(readByQuery).toHaveBeenCalledOnce()
	})

	it('rejects bulk ownership mixes that cannot be represented by one payload', async () => {
		const records = [
			{ ...exact('/a', '/b', 1), managed_by: 'sluggernaut' },
			{ ...exact('/c', '/changed', 2), managed_by: 'sluggernaut' },
		]
		const { filters } = setup(records)
		const update = filters.get('items.update')!

		await expect(
			update(
				{ destination: '/changed' },
				{ collection: 'custom_redirects', keys: [1, 2] },
				eventContext,
			),
		).rejects.toThrow(/cannot mix managed structural edits/)
	})

	it('does not expand the replaced record through its previous destination', async () => {
		const existing = exact('/a', '/old', 1)
		const { filters, readByQuery } = setup([existing])
		readByQuery.mockResolvedValueOnce([existing]).mockResolvedValueOnce([])
		const update = filters.get('items.update')!

		await update(
			{ destination: '/new' },
			{ collection: 'custom_redirects', keys: [1] },
			eventContext,
		)

		expect(readByQuery).toHaveBeenCalledOnce()
		expect(readByQuery.mock.calls[0]?.[0].filter._and[2].origin._in).toEqual(['/a', '/new'])
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
