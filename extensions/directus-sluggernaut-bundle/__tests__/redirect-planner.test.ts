import type { CollectionConfiguration } from '../src/shared/configuration/types'

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
			},
		},
	],
	warnings: [],
}

describe('redirect planner', () => {
	it('prefers the first permalink source over the slug source', () => {
		expect(selectRedirectSource(configuration)).toEqual({ type: 'permalink', field: 'route' })
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
			sourceCollection: 'articles',
			sourceItem: '1',
			existingRedirects: [],
		})

		expect(plan.create).toMatchObject({
			origin: '/news/old',
			destination: '/news/new',
			managedBy: 'sluggernaut',
			sourceType: 'permalink',
		})
	})

	it('flattens managed redirect chains', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/b',
			newCanonical: '/c',
			source: { type: 'permalink', field: 'route' },
			sourceCollection: 'articles',
			sourceItem: '1',
			existingRedirects: [
				{
					id: 'old',
					origin: '/a',
					destination: '/b',
					type: 301,
					isActive: true,
					managedBy: 'sluggernaut',
					sourceCollection: 'articles',
					sourceItem: '1',
					sourceField: 'route',
					sourceType: 'permalink',
					inactiveReason: null,
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
			sourceCollection: 'articles',
			sourceItem: '1',
			existingRedirects: [
				{
					id: 'managed',
					origin: '/a',
					destination: '/previous',
					type: 301,
					isActive: true,
					managedBy: 'sluggernaut',
					sourceCollection: 'articles',
					sourceItem: '1',
					sourceField: 'route',
					sourceType: 'permalink',
					inactiveReason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.rewrite).toEqual([{ id: 'managed', destination: '/b' }])
	})

	it('does not rewrite a managed redirect owned by another source item', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/a',
			newCanonical: '/b',
			source: { type: 'permalink', field: 'route' },
			sourceCollection: 'articles',
			sourceItem: '2',
			existingRedirects: [
				{
					id: 'managed-by-item-1',
					origin: '/a',
					destination: '/previous',
					type: 301,
					isActive: true,
					managedBy: 'sluggernaut',
					sourceCollection: 'articles',
					sourceItem: '1',
					sourceField: 'route',
					sourceType: 'permalink',
					inactiveReason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.warnings).toHaveLength(1)
		expect(plan.rewrite).toEqual([])
	})

	it('preserves unowned conflicts and prevents self-loop reversion', () => {
		const plan = planCanonicalRedirect({
			oldCanonical: '/b',
			newCanonical: '/c',
			source: { type: 'permalink', field: 'route' },
			sourceCollection: 'articles',
			sourceItem: '1',
			existingRedirects: [
				{ id: 'manual', origin: '/b', destination: '/manual', type: 302, isActive: true },
				{
					id: 'loop',
					origin: '/c',
					destination: '/d',
					type: 301,
					isActive: true,
					managedBy: 'sluggernaut',
					sourceCollection: 'articles',
					sourceItem: '1',
					sourceField: 'route',
					sourceType: 'permalink',
					inactiveReason: null,
				},
			],
		})

		expect(plan.create).toBeNull()
		expect(plan.warnings).toHaveLength(1)
		expect(plan.deactivate).toEqual([{ id: 'loop', inactiveReason: null }])
	})

	it('deactivates and reactivates only managed lifecycle records', () => {
		const redirects = [
			{
				id: 'managed',
				origin: '/a',
				destination: '/b',
				type: 301,
				isActive: true,
				managedBy: 'sluggernaut' as const,
				inactiveReason: null,
			},
			{
				id: 'manual',
				origin: '/x',
				destination: '/y',
				type: 301,
				isActive: true,
			},
		]
		expect(planLifecycleDeactivation(redirects, 'delete')).toEqual([
			{ id: 'managed', inactiveReason: 'delete' },
		])
		expect(
			planArchiveReactivation([
				{ ...redirects[0]!, inactiveReason: 'archive', isActive: false },
			]),
		).toEqual([{ id: 'managed', isActive: true, inactiveReason: null }])
	})
})
