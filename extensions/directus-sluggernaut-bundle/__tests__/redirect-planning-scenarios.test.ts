import type { CollectionConfiguration } from '../src/shared/configuration/types'
import type { Redirect, RedirectSource } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it } from 'vitest'

import {
	canonicalUrlForItem,
	planCanonicalRedirect,
	selectRedirectSource,
} from '../src/sluggernaut-hook/redirects/planner'

const source: RedirectSource = {
	type: 'permalink' as const,
	field: 'route',
	includeUnmanagedRedirectsInPlanning: true,
	unmanagedRedirectConflictBehavior: 'override' as const,
}

const redirect = (overrides: Partial<Redirect> = {}): Redirect => ({
	id: 'redirect',
	origin: '/old',
	destination: '/previous',
	type: 301,
	date_created: '2025-03-17T15:19:35.672Z',
	date_updated: null,
	user_created: null,
	user_updated: null,
	start_date: null,
	end_date: null,
	match: 'exact',
	specificity: null,
	matcher_signature: null,
	is_active: true,
	managed_by: 'sluggernaut',
	source_collection: 'articles',
	source_item: '1',
	source_field: 'route',
	source_type: 'permalink',
	inactive_reason: null,
	...overrides,
})

const configuration: CollectionConfiguration = {
	slugs: [
		{
			field: 'slug',
			sort: 2,
			options: {
				sourceFields: ['title'],
				locale: 'en',
				lowercase: true,
				updateOnSourceChange: true,
				automaticRedirects: true,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	permalinks: [
		{
			field: 'route',
			sort: 1,
			options: {
				generateFromSlug: true,
				slugField: 'slug',
				updateOnSlugChange: true,
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: true,
				includeUnmanagedRedirectsInPlanning: true,
				unmanagedRedirectConflictBehavior: 'override',
			},
		},
	],
	warnings: [],
}

function plan(
	oldCanonical: string | null,
	newCanonical: string | null,
	existingRedirects: readonly Redirect[] = [],
	redirectSource: RedirectSource = source,
) {
	return planCanonicalRedirect({
		oldCanonical,
		newCanonical,
		source: redirectSource,
		source_collection: 'articles',
		source_item: '1',
		existingRedirects,
	})
}

describe('Redirect planning scenarios', () => {
	it('is idempotent for an unchanged canonical value', () => {
		expect(plan('/same', '/same', [redirect()])).toEqual({
			create: null,
			rewrite: [],
			reactivate: [],
			deactivate: [],
			warnings: [],
		})
	})

	it('disables redirect planning and selects an automatic slug when enabled', () => {
		expect(selectRedirectSource({ ...configuration, slugs: [], permalinks: [] })).toBeNull()
		const slugConfiguration = {
			...configuration,
			permalinks: configuration.permalinks.map((field) => ({
				...field,
				options: { ...field.options, automaticRedirects: false },
			})),
		}
		expect(selectRedirectSource(slugConfiguration)).toMatchObject({
			type: 'slug',
			field: 'slug',
		})
		expect(
			plan('/canonical-old', '/canonical-new', [], { ...source, type: 'slug', field: 'slug' })
				.create,
		).toMatchObject({
			origin: '/canonical-old',
			destination: '/canonical-new',
			source_type: 'slug',
		})
	})

	it('prefer the first enabled permalink source', () => {
		expect(selectRedirectSource(configuration)).toMatchObject({
			type: 'permalink',
			field: 'route',
		})
		const result = selectRedirectSource({
			...configuration,
			permalinks: [
				{
					...configuration.permalinks[0]!,
					options: { ...configuration.permalinks[0]!.options, automaticRedirects: false },
				},
				{ ...configuration.permalinks[0]!, field: 'preview_route' },
			],
		})
		expect(result).toMatchObject({ field: 'preview_route' })
	})

	it('preserve complete redirect provenance', () => {
		expect(plan('/old', '/new').create).toMatchObject({
			managed_by: 'sluggernaut',
			source_collection: 'articles',
			source_item: '1',
			source_field: 'route',
			source_type: 'permalink',
		})
	})

	it('does not plan unavailable canonical values', () => {
		expect(plan(null, '/new').create).toBeNull()
		expect(plan('/old', null).create).toBeNull()
	})

	it('flatten reversions and sequential changes to the latest destination', () => {
		const reversion = plan('/a', '/b', [
			redirect({ id: 'a-to-b', origin: '/a', destination: '/b', is_active: false }),
			redirect({ id: 'b-to-a', origin: '/b', destination: '/a' }),
		])
		expect(reversion.reactivate).toEqual([{ id: 'a-to-b' }])
		expect(reversion.deactivate).toEqual([{ id: 'b-to-a', inactive_reason: null }])
		const sequential = plan('/b', '/c', [
			redirect({ id: 'a-to-b', origin: '/a', destination: '/b' }),
		])
		expect(sequential.rewrite).toEqual([{ id: 'a-to-b', destination: '/c' }])
	})

	it('rewrite existing origins without claiming ownership', () => {
		expect(plan('/old', '/new', [redirect({ id: 'managed' })]).rewrite).toEqual([
			{ id: 'managed', destination: '/new' },
		])
		expect(
			plan('/old', '/new', [redirect({ source_item: 'other', source_collection: 'other' })])
				.rewrite,
		).toEqual([{ id: 'redirect', destination: '/new' }])
	})

	it('handles unavailable or disabled redirect infrastructure at the planning boundary', () => {
		expect(selectRedirectSource({ ...configuration, slugs: [], permalinks: [] })).toBeNull()
		expect(plan('/old', '/new', [])).toMatchObject({ warnings: [], create: expect.any(Object) })
	})

	it('and flatten chains and deactivate canonical loops', () => {
		const result = plan('/b', '/c', [
			redirect({ id: 'chain', origin: '/a', destination: '/b' }),
			redirect({ id: 'loop', origin: '/c', destination: '/elsewhere' }),
		])
		expect(result.rewrite).toContainEqual({ id: 'chain', destination: '/c' })
		expect(result.deactivate).toContainEqual({ id: 'loop', inactive_reason: null })
	})

	it('apply conflict policy and preserve excluded manual history', () => {
		const manual = redirect({
			managed_by: null,
			source_collection: null,
			source_item: null,
			source_field: null,
			source_type: null,
		})
		expect(plan('/old', '/new', [manual]).rewrite).toEqual([
			{ id: 'redirect', destination: '/new' },
		])
		const blocked = plan('/old', '/new', [manual], {
			...source,
			unmanagedRedirectConflictBehavior: 'block',
		})
		expect(blocked.rewrite).toEqual([])
		expect(blocked.warnings).toHaveLength(1)
		const excluded = plan('/old', '/new', [manual], {
			...source,
			includeUnmanagedRedirectsInPlanning: false,
		})
		expect(excluded.create).toMatchObject({ origin: '/old', destination: '/new' })
		const unrelated = plan('/old', '/new', [
			redirect({
				id: 'unrelated',
				origin: '/manual',
				destination: '/elsewhere',
				managed_by: null,
			}),
		])
		expect(unrelated.rewrite).toEqual([])
	})

	it('handle malformed, duplicate, and provenance-conflicting records conservatively', () => {
		expect(
			plan('/old', '/new', [redirect({ id: 'first' }), redirect({ id: 'second' })]).rewrite,
		).toEqual([{ id: 'second', destination: '/new' }])
		const blocked = plan(
			'/old',
			'/new',
			[
				redirect({
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
				}),
			],
			{ ...source, unmanagedRedirectConflictBehavior: 'block' },
		)
		expect(blocked.create).toBeNull()
		expect(canonicalUrlForItem(source, { route: '/valid//route' })).toBe('/valid/route')
	})

	it('preserves scheduled dates because rewrites only change destinations', () => {
		const scheduled = redirect({
			start_date: '2026-01-01T00:00:00.000Z',
			end_date: '2027-01-01T00:00:00.000Z',
		})
		expect(plan('/old', '/new', [scheduled]).rewrite).toEqual([
			{ id: 'redirect', destination: '/new' },
		])
	})
})
