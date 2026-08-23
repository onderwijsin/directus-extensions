import { describe, expect, it } from 'vitest'

import {
	deriveExactGraphFrontier,
	normalizeExactRedirectDestination,
	normalizeExactRedirectOrigin,
	participatesInActiveExactGraph,
	requiresExactIntegrityLookup,
	validateExactRedirect,
	validateRelevantExactRedirectGraph,
} from '../src/sluggernaut-hook/redirects/direct'
import { decideRedirectOwnership } from '../src/sluggernaut-hook/redirects/direct/ownership'
import { materializeRedirectState } from '../src/sluggernaut-hook/redirects/direct/state'

const exact = (origin: string, destination: string, id?: number, is_active = true) => ({
	id,
	origin,
	destination,
	match: 'exact',
	is_active,
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
			{ origin: '/old', destination: '/new', is_active: true, start_date: 'tomorrow' },
			{ destination: null, is_active: false },
		)
		expect(state).toEqual({
			origin: '/old',
			destination: null,
			is_active: false,
			start_date: 'tomorrow',
		})
	})

	it('applies one shared update payload independently to multiple existing states', () => {
		const payload = { destination: null, is_active: false, type: 302 }
		expect(
			materializeRedirectState(
				{ origin: '/one', destination: '/first', is_active: true, type: 301 },
				payload,
			),
		).toMatchObject({ origin: '/one', destination: null, is_active: false, type: 302 })
		expect(
			materializeRedirectState(
				{ origin: '/two', destination: '/second', is_active: true, type: 307 },
				payload,
			),
		).toMatchObject({ origin: '/two', destination: null, is_active: false, type: 302 })
	})

	it('transfers managed ownership only for changed structural fields', () => {
		const existing = {
			...exact('/old', '/new', 1),
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
		const existing = {
			...exact('/old', '/new', 1),
			managed_by: 'sluggernaut',
			source_collection: 'pages',
			source_item: 1,
			source_field: 'route',
			source_type: 'permalink',
			inactive_reason: null,
		}
		const proposed = { ...existing, [field]: value }
		expect(decideRedirectOwnership(existing, proposed).transfersOwnership).toBe(true)
	})

	it('does not transfer unmanaged ownership or clear provenance on internal mutations', () => {
		const unmanaged = { ...exact('/old', '/new', 1), managed_by: null, source_item: null }
		expect(
			decideRedirectOwnership(unmanaged, { ...unmanaged, destination: '/other' })
				.transfersOwnership,
		).toBe(false)
		const managed = { ...exact('/old', '/new', 1), managed_by: 'sluggernaut', source_item: 1 }
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

	it('rejects validation with an incomplete relevant graph context', () => {
		expect(() =>
			validateRelevantExactRedirectGraph([exact('/a', '/b', 1)], [], new Set(['/a'])),
		).toThrow(/graph context is incomplete/)
	})
})
