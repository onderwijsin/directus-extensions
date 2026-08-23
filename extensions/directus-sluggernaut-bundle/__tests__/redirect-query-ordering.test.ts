import type { Query } from '@directus/types'

import { describe, expect, it } from 'vitest'

import {
	applyDefaultRedirectOrdering,
	DEFAULT_REDIRECT_SORT,
	registerRedirectQueryOrdering,
} from '../src/sluggernaut-hook/redirects/query'

const options = {
	SLUGGERNAUT_REDIRECTS_ENABLED: true,
	SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_redirects',
} as const

function register(enabled = true) {
	const filters = new Map<string, (...args: unknown[]) => unknown>()
	registerRedirectQueryOrdering(
		{
			filter: (event: string, callback: (...args: unknown[]) => unknown) =>
				filters.set(event, callback),
		} as never,
		{ ...options, SLUGGERNAUT_REDIRECTS_ENABLED: enabled } as never,
	)
	return filters.get('items.query')
}

describe('redirect query ordering', () => {
	it('adds exact-first, specificity-descending, and id-ascending ordering', () => {
		expect(applyDefaultRedirectOrdering({ fields: ['id'] })).toEqual({
			fields: ['id'],
			sort: [...DEFAULT_REDIRECT_SORT],
		})
	})

	it('does not mutate the caller query or the shared default tuple', () => {
		const query: Query = { filter: null }
		const result = applyDefaultRedirectOrdering(query)

		expect(result).not.toBe(query)
		expect(query).toEqual({ filter: null })
		expect(DEFAULT_REDIRECT_SORT).toEqual(['match', '-specificity', 'id'])
	})

	it.each([{ sort: ['origin'] }, { sort: ['-date_created', 'id'] }])(
		'preserves an explicit sort: %o',
		({ sort }) => {
			const query = { sort }
			expect(applyDefaultRedirectOrdering(query)).toBe(query)
		},
	)

	it.each([{ sort: null }, { sort: [] }, {}])(
		'adds defaults when sort is absent or empty: %o',
		(query) => {
			expect(applyDefaultRedirectOrdering(query)).toMatchObject({
				sort: [...DEFAULT_REDIRECT_SORT],
			})
		},
	)

	it('registers only when redirects are enabled', () => {
		expect(register(false)).toBeUndefined()
		expect(register()).toBeTypeOf('function')
	})

	it('scopes ordering to the configured redirect collection', () => {
		const query = { limit: 10 }
		const filter = register()!

		expect(filter(query, { collection: 'articles' }, {})).toBe(query)
		expect(filter(query, { collection: 'custom_redirects' }, {})).toEqual({
			limit: 10,
			sort: [...DEFAULT_REDIRECT_SORT],
		})
	})

	it('orders a combined exact and pattern dataset without changing the query scope', () => {
		const query: Query = {
			fields: ['id', 'origin', 'destination', 'match', 'specificity'],
			filter: {
				_and: [
					{ is_active: { _eq: true } },
					{ origin: { _in: ['/legacy/archive', '/legacy/article'] } },
				],
			},
			limit: 3,
			offset: 3,
		}
		const result = applyDefaultRedirectOrdering(query)

		expect(result).toEqual({
			...query,
			sort: ['match', '-specificity', 'id'],
		})
		expect(result.filter).toBe(query.filter)
		expect(result.fields).toBe(query.fields)
	})

	it('preserves inactive and scheduled-record filters while adding precedence ordering', () => {
		const query: Query = {
			filter: {
				_and: [
					{ is_active: { _eq: true } },
					{ start_date: { _lte: '$NOW' } },
					{ end_date: { _gte: '$NOW' } },
				],
			},
		}
		const result = applyDefaultRedirectOrdering(query)

		expect(result.filter).toBe(query.filter)
		expect(result.sort).toEqual(['match', '-specificity', 'id'])
	})

	it('keeps pagination and projected metadata fields intact for deterministic pages', () => {
		const query: Query = {
			fields: ['id', 'match', 'specificity'],
			limit: 25,
			offset: 50,
			page: 3,
			sort: null,
		}

		expect(applyDefaultRedirectOrdering(query)).toMatchObject({
			fields: query.fields,
			limit: 25,
			offset: 50,
			page: 3,
			sort: ['match', '-specificity', 'id'],
		})
	})

	it('preserves malformed runtime query payloads instead of throwing', () => {
		const filter = register()!
		for (const query of [null, undefined, 'not-a-query', 42, { sort: 'origin' }]) {
			expect(filter(query, { collection: 'custom_redirects' }, {})).toBe(query)
		}
	})
})
