import type { CollectionConfiguration } from '../src/shared/configuration/types'
import type { Redirect } from '../src/sluggernaut-hook/redirects/schema'

import { describe, expect, it } from 'vitest'

import {
	canonicalUrlForItem,
	planArchiveReactivation,
	planCanonicalRedirect,
	planLifecycleDeactivation,
	selectRedirectSource,
} from '../src/sluggernaut-hook/redirects/planner'

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

describe('redirect planner', () => {
	it('prefers the first permalink source over the slug source', () => {
		expect(selectRedirectSource(configuration)).toEqual({
			type: 'permalink',
			field: 'route',
			includeUnmanagedRedirectsInPlanning: true,
			unmanagedRedirectConflictBehavior: 'override',
		})
	})

	it('does not let a later permalink replace the first disabled one', () => {
		const source = selectRedirectSource({
			...configuration,
			permalinks: [
				{
					...configuration.permalinks[0]!,
					options: { ...configuration.permalinks[0]!.options, automaticRedirects: false },
				},
				{
					...configuration.permalinks[0]!,
					field: 'preview_route',
					options: { ...configuration.permalinks[0]!.options, automaticRedirects: true },
				},
			],
			slugs: configuration.slugs.map((field) => ({
				...field,
				options: { ...field.options, automaticRedirects: false },
			})),
		})
		expect(source).toBeNull()
	})

	it('normalizes permalink and slug canonical values', () => {
		expect(
			canonicalUrlForItem({ type: 'permalink', field: 'route' }, { route: '/news//hello' }),
		).toBe('/news/hello')
		expect(canonicalUrlForItem({ type: 'slug', field: 'slug' }, { slug: 'hello' })).toBe(
			'/hello',
		)
	})

	it('creates one managed redirect for a canonical change', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/news/old',
			newCanonical: '/news/new',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [],
		})

		expect(plan.create).toMatchObject({
			origin: '/news/old',
			destination: '/news/new',
			managed_by: 'sluggernaut',
			source_type: 'permalink',
		})
	})

	it('flattens managed redirect chains', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/b',
			newCanonical: '/c',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [
				{
					id: 'old',
					origin: '/a',
					destination: '/b',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
			],
		})

		expect(plan.rewrite).toEqual([{ id: 'old', destination: '/c' }])
	})

	it('updates an existing managed origin instead of creating a duplicate', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/a',
			newCanonical: '/b',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [
				{
					id: 'managed',
					origin: '/a',
					destination: '/previous',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.rewrite).toEqual([{ id: 'managed', destination: '/b' }])
	})

	it('reactivates a loop-suppressed origin when a canonical value returns to it', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/a',
			newCanonical: '/b',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [
				{
					id: 'a-to-b',
					origin: '/a',
					destination: '/b',
					type: 301,
					is_active: false,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
				{
					id: 'b-to-a',
					origin: '/b',
					destination: '/a',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.rewrite).toEqual([{ id: 'a-to-b', destination: '/b' }])
		expect(plan.reactivate).toEqual([{ id: 'a-to-b' }])
		expect(plan.deactivate).toEqual([{ id: 'b-to-a', inactive_reason: null }])
	})

	it('rewrites a managed redirect owned by another source item so the latest canonical wins', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/a',
			newCanonical: '/b',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '2',
			existingRedirects: [
				{
					id: 'managed-by-item-1',
					origin: '/a',
					destination: '/previous',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.warnings).toHaveLength(0)
		expect(plan.rewrite).toEqual([{ id: 'managed-by-item-1', destination: '/b' }])
	})

	it('preserves unowned conflicts and prevents self-loop reversion', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/b',
			newCanonical: '/c',
			source: { type: 'permalink', field: 'route' },
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [
				{
					id: 'manual',
					origin: '/b',
					destination: '/manual',
					type: 302,
					is_active: true,
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
					inactive_reason: null,
				},
				{
					id: 'loop',
					origin: '/c',
					destination: '/d',
					type: 301,
					is_active: true,
					managed_by: 'sluggernaut',
					source_collection: 'articles',
					source_item: '1',
					source_field: 'route',
					source_type: 'permalink',
					inactive_reason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.warnings).toHaveLength(0)
		expect(plan.rewrite).toContainEqual({ id: 'manual', destination: '/c' })
		expect(plan.deactivate).toEqual([{ id: 'loop', inactive_reason: null }])
	})

	it('can block an included unmanaged conflict', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/old',
			newCanonical: '/new',
			source: {
				type: 'permalink',
				field: 'route',
				unmanagedRedirectConflictBehavior: 'block',
			},
			source_collection: 'articles',
			source_item: '1',
			existingRedirects: [
				{
					id: 'manual',
					origin: '/old',
					destination: '/manual',
					type: 302,
					is_active: true,
					managed_by: null,
					source_collection: null,
					source_item: null,
					source_field: null,
					source_type: null,
					inactive_reason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.rewrite).toEqual([])
		expect(plan.warnings).toHaveLength(1)
	})

	it('deactivates and reactivates only managed lifecycle records', () => {
		const redirects: Redirect[] = [
			{
				id: 'managed',
				origin: '/a',
				destination: '/b',
				type: 301,
				is_active: true,
				managed_by: 'sluggernaut' as const,
				source_collection: null,
				source_item: null,
				source_field: null,
				source_type: null,
				inactive_reason: null,
			},
			{
				id: 'manual',
				origin: '/x',
				destination: '/y',
				type: 301,
				is_active: true,
				managed_by: null,
				source_collection: null,
				source_item: null,
				source_field: null,
				source_type: null,
				inactive_reason: null,
			},
		]
		expect(planLifecycleDeactivation(redirects, 'delete')).toEqual([
			{ id: 'managed', inactive_reason: 'delete' },
		])
		expect(
			planArchiveReactivation([
				{ ...redirects[0]!, inactive_reason: 'archive', is_active: false },
			]),
		).toEqual([{ id: 'managed', is_active: true, inactive_reason: null }])
	})
})
