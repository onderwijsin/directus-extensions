import type { ExactRedirectInput } from '../src/sluggernaut-hook/redirects/domain/exact-integrity'
import type { Redirect } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it } from 'vitest'

import {
	deriveExactGraphFrontier,
	normalizeExactRedirectDestination,
	normalizeExactRedirectOrigin,
	participatesInActiveExactGraph,
	requiresExactIntegrityLookup,
	validateExactRedirect,
	validateRelevantExactRedirectGraph,
} from '../src/sluggernaut-hook/redirects/domain'
import { decideRedirectOwnership } from '../src/sluggernaut-hook/redirects/domain/ownership'
import { materializeRedirectState } from '../src/sluggernaut-hook/redirects/domain/state'

const exact = (
	origin: string,
	destination: string,
	id?: number,
	is_active = true,
): ExactRedirectInput => ({
	id,
	origin,
	destination,
	match: 'exact' as const,
	is_active,
})

const persisted = (
	origin: string,
	destination: string,
	managed_by: Redirect['managed_by'] = null,
): Redirect => ({
	id: 1,
	origin,
	destination,
	type: 301,
	match: 'exact',
	specificity: null,
	matcher_signature: null,
	is_active: true,
	start_date: null,
	end_date: null,
	managed_by,
	source_collection: managed_by === 'sluggernaut' ? 'pages' : null,
	source_item: managed_by === 'sluggernaut' ? 1 : null,
	source_field: managed_by === 'sluggernaut' ? 'route' : null,
	source_type: managed_by === 'sluggernaut' ? 'permalink' : null,
	inactive_reason: null,
	user_created: null,
	date_created: '2026-01-01T00:00:00.000Z',
	user_updated: null,
	date_updated: null,
})

describe('exact redirect domain', () => {
	it('normalizes origins and preserves their trailing slash choice', () => {
		expect(normalizeExactRedirectOrigin('/news//item/')).toBe('/news/item/')
		expect(() => normalizeExactRedirectOrigin('/news/:item')).toThrow()
		expect(() => normalizeExactRedirectOrigin('/news/*')).toThrow()
	})

	it.each([
		['/news?draft=true', 'query string'],
		['/news#section', 'fragment'],
		['/news/../home', 'dot traversal'],
		['/%2e%2e/home', 'encoded traversal'],
		['/news\\item', 'backslash'],
		['/news item', 'whitespace'],
		['/news\titem', 'control whitespace'],
		['/news\u007fitem', 'delete control character'],
		['https://example.com/news', 'host'],
		['//example.com/news', 'protocol-relative URL'],
	] as const)('rejects unsafe exact origins (%s: %s)', (value, _label) => {
		expect(() => normalizeExactRedirectOrigin(value)).toThrow()
	})

	it('classifies valid external destinations without rewriting them', () => {
		expect(normalizeExactRedirectDestination('https://example.com/a?q=1#part')).toEqual({
			kind: 'external',
			value: 'https://example.com/a?q=1#part',
		})
		expect(normalizeExactRedirectDestination('http://example.com')).toMatchObject({
			kind: 'external',
		})
		for (const value of ['//example.com/a', 'ftp://example.com', 'https:/example.com'])
			expect(() => normalizeExactRedirectDestination(value)).toThrow()
		expect(() => normalizeExactRedirectDestination('mailto:user@example.com')).toThrow()
		expect(() => normalizeExactRedirectDestination('https//example.com/a')).toThrow()
	})

	it('rejects path query strings and fragments while allowing them on external URLs', () => {
		expect(() => normalizeExactRedirectOrigin('/news?draft=true')).toThrow()
		expect(() => normalizeExactRedirectOrigin('/news#section')).toThrow()
		expect(
			normalizeExactRedirectDestination('https://example.com/news?draft=true#section'),
		).toEqual({
			kind: 'external',
			value: 'https://example.com/news?draft=true#section',
		})
	})

	it('normalizes ordinary internal destinations as paths', () => {
		expect(normalizeExactRedirectDestination('/news//latest/')).toEqual({
			kind: 'path',
			value: '/news/latest/',
		})
	})

	it('preserves omitted, null, and falsey update values', () => {
		const state = materializeRedirectState(
			{ ...persisted('/old', '/new'), start_date: 'tomorrow' },
			{ destination: null, is_active: false },
		)
		expect(state).toMatchObject({
			origin: '/old',
			destination: null,
			is_active: false,
			start_date: 'tomorrow',
		})
	})

	it('applies one shared update payload independently to multiple existing states', () => {
		const payload = { destination: null, is_active: false, type: 302 as const }
		expect(
			materializeRedirectState({ ...persisted('/one', '/first'), type: 301 }, payload),
		).toMatchObject({ origin: '/one', destination: null, is_active: false, type: 302 })
		expect(
			materializeRedirectState({ ...persisted('/two', '/second'), type: 307 }, payload),
		).toMatchObject({ origin: '/two', destination: null, is_active: false, type: 302 })
	})

	it('transfers managed ownership only for changed structural fields', () => {
		const existing: Redirect = {
			...persisted('/old', '/new', 'sluggernaut'),
			type: 301,
			managed_by: 'sluggernaut',
			source_collection: 'pages',
			source_item: 1,
			source_field: 'route',
			source_type: 'permalink',
			inactive_reason: 'archived',
		}
		const same = decideRedirectOwnership(existing, { ...existing, is_active: false })
		expect(same.transfersOwnership).toBe(false)
		expect(
			decideRedirectOwnership(
				{ ...existing, origin: '/old/item' },
				{ ...existing, origin: '/old//item' },
			).transfersOwnership,
		).toBe(false)
		expect(
			decideRedirectOwnership(
				{ ...existing, destination: '/new/item' },
				{ ...existing, destination: '/new//item' },
			).transfersOwnership,
		).toBe(false)
		expect(
			decideRedirectOwnership(existing, { ...existing, match: 'exact' }).transfersOwnership,
		).toBe(false)
		expect(
			decideRedirectOwnership(existing, { ...existing, type: 301 }).transfersOwnership,
		).toBe(false)
		const changed = decideRedirectOwnership(existing, { ...existing, destination: '/other' })
		expect(changed).toMatchObject({ transfersOwnership: true })
		expect(changed.state).toMatchObject({
			managed_by: null,
			source_collection: null,
			source_item: null,
			source_field: null,
			source_type: null,
			inactive_reason: null,
		})
	})

	it.each([
		['origin', '/new-origin'],
		['destination', '/new-destination'],
		['match', 'pattern'],
		['type', 302],
	] as const)('transfers ownership when structural field %s changes', (field, value) => {
		const existing: Redirect = {
			...persisted('/old', '/new', 'sluggernaut'),
			managed_by: 'sluggernaut',
			source_collection: 'pages',
			source_item: 1,
			source_field: 'route',
			source_type: 'permalink',
			inactive_reason: null,
		}
		if (field === 'origin')
			expect(
				decideRedirectOwnership(existing, { ...existing, origin: value })
					.transfersOwnership,
			).toBe(true)
		if (field === 'destination')
			expect(
				decideRedirectOwnership(existing, { ...existing, destination: value })
					.transfersOwnership,
			).toBe(true)
		if (field === 'match')
			expect(
				decideRedirectOwnership(existing, { ...existing, match: value }).transfersOwnership,
			).toBe(true)
		if (field === 'type')
			expect(
				decideRedirectOwnership(existing, { ...existing, type: value }).transfersOwnership,
			).toBe(true)
	})

	it('does not transfer unmanaged ownership or clear provenance on internal mutations', () => {
		const unmanaged = persisted('/old', '/new')
		expect(
			decideRedirectOwnership(unmanaged, { ...unmanaged, destination: '/other' })
				.transfersOwnership,
		).toBe(false)
		const managed = persisted('/old', '/new', 'sluggernaut')
		const internal = decideRedirectOwnership(
			managed,
			{ ...managed, destination: '/other' },
			'internal',
		)
		expect(internal).toEqual({
			transfersOwnership: false,
			state: { ...managed, destination: '/other' },
		})
	})

	it('limits graph participation to active exact redirects', () => {
		expect(participatesInActiveExactGraph(exact('/a', '/b'))).toBe(true)
		expect(participatesInActiveExactGraph(exact('/a', '/b', undefined, false))).toBe(false)
	})

	it('detects graph-affecting transitions while ignoring operational changes', () => {
		const previous = exact('/a', '/b', 1)
		expect(requiresExactIntegrityLookup(previous, { ...previous, is_active: true })).toBe(false)
		expect(requiresExactIntegrityLookup(previous, { ...previous, type: 302 })).toBe(false)
		expect(
			requiresExactIntegrityLookup(previous, { ...previous, start_date: '2026-01-01' }),
		).toBe(false)
		expect(
			requiresExactIntegrityLookup(previous, { ...previous, end_date: '2026-12-31' }),
		).toBe(false)
		expect(requiresExactIntegrityLookup(previous, { ...previous, managed_by: null })).toBe(
			false,
		)
		expect(requiresExactIntegrityLookup({ ...previous, is_active: false }, previous)).toBe(true)
		expect(requiresExactIntegrityLookup(null, { ...previous, is_active: false })).toBe(false)
		expect(requiresExactIntegrityLookup(null, previous)).toBe(true)
		expect(requiresExactIntegrityLookup(previous, { ...previous, is_active: false })).toBe(
			false,
		)
		expect(requiresExactIntegrityLookup(previous, { ...previous, origin: '/other' })).toBe(true)
		expect(
			requiresExactIntegrityLookup(previous, {
				...previous,
				destination: 'https://example.com',
			}),
		).toBe(true)
	})

	it('expands only the relevant batched frontier and reaches closure', () => {
		const candidate = exact('/a', '/b', 1)
		expect(deriveExactGraphFrontier([candidate], [], new Set())).toEqual({
			requestedOrigins: ['/a', '/b'],
			complete: false,
		})
		const next = deriveExactGraphFrontier(
			[candidate],
			[exact('/b', '/c', 2), exact('/foo', '/bar', 3)],
			new Set(['/a', '/b']),
		)
		expect(next).toEqual({ requestedOrigins: ['/c'], complete: false })
		expect(
			deriveExactGraphFrontier(
				[candidate],
				[exact('/b', '/c', 2)],
				new Set(['/a', '/b', '/c']),
			),
		).toEqual({ requestedOrigins: [], complete: true })
		const batched = deriveExactGraphFrontier([exact('/x', '/y', 4), candidate], [], new Set())
		expect(batched.requestedOrigins).toHaveLength(4)
		expect(batched.requestedOrigins).toEqual(expect.arrayContaining(['/x', '/y', '/a', '/b']))
		const repeated = deriveExactGraphFrontier(
			[candidate],
			[exact('/b', '/c', 2), exact('/c', '/d', 3)],
			new Set(['/a', '/b', '/c']),
		)
		expect(repeated).toEqual({ requestedOrigins: ['/d'], complete: false })
	})

	it('validates uniqueness, cycles, self-loops, and external terminals', () => {
		expect(() => validateExactRedirect(exact('/a', '/a'))).toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1)],
				[exact('/b', '/a', 2)],
				new Set(['/a', '/b']),
			),
		).toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1)],
				[exact('/b', '/c', 2), exact('/c', '/a', 3)],
				new Set(['/a', '/b', '/c']),
			),
		).toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1)],
				[exact('/a', '/c', 2, false)],
				new Set(['/a', '/b']),
			),
		).not.toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1)],
				[exact('/a', '/c', 2)],
				new Set(['/a', '/b']),
			),
		).toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1, true)],
				[exact('/a', '/c', 2, false)],
				new Set(['/a', '/b']),
			),
		).not.toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1, true)],
				[exact('/a', '/c', 2, true)],
				new Set(['/a', '/b']),
			),
		).toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1, true)],
				[exact('/a', '/c', 2, false)],
				new Set(['/a', '/b']),
			),
		).not.toThrow()
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', 'https://example.com', 1)],
				[],
				new Set(['/a']),
			),
		).not.toThrow()
	})

	it('rejects duplicate active candidate origins even when candidates have no IDs', () => {
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b'), exact('/a', '/c')],
				[],
				new Set(['/a', '/b', '/c']),
			),
		).toThrow(/Multiple active exact candidates/)
	})

	it('rejects cycles formed entirely by resulting mutation candidates', () => {
		expect(() =>
			validateRelevantExactRedirectGraph(
				[exact('/a', '/b', 1), exact('/b', '/a', 2)],
				[],
				new Set(['/a', '/b']),
			),
		).toThrow(/cycle/)
	})

	it('rejects validation with an incomplete relevant graph context', () => {
		expect(() =>
			validateRelevantExactRedirectGraph([exact('/a', '/b', 1)], [], new Set(['/a'])),
		).toThrow(/graph context is incomplete/)
	})
})
