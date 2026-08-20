import type { CollectionConfiguration } from '../src/shared/types'

import { describe, expect, it } from 'vitest'

import { coordinateMutation } from '../src/sluggernaut-hook/mutation-coordinator'

const configuration: CollectionConfiguration = {
	slugs: [
		{
			field: 'public_slug',
			sort: 1,
			options: {
				sourceFields: ['title'],
				locale: 'en',
				lowercase: true,
				updateOnSourceChange: true,
				automaticRedirects: false,
			},
		},
	],
	permalinks: [
		{
			field: 'canonical_route',
			sort: 2,
			options: {
				generateFromSlug: true,
				slugField: 'public_slug',
				updateOnSlugChange: false,
				prefix: '/news',
				validatePrefixOnManualInput: false,
				trailingSlash: false,
				enforceTrailingSlashOnManualInput: false,
				automaticRedirects: false,
			},
		},
	],
	warnings: [],
}

describe('coordinateMutation', () => {
	it('derives slug and permalink in dependency order on create', () => {
		const result = coordinateMutation({
			kind: 'create',
			payload: { title: 'Hello World' },
			existingItem: {},
			configuration,
		})

		expect(result.payload).toMatchObject({
			title: 'Hello World',
			public_slug: 'hello-world',
			canonical_route: '/news/hello-world',
		})
	})

	it('uses final source state when a source becomes null', () => {
		const result = coordinateMutation({
			kind: 'update',
			payload: { title: null },
			existingItem: { title: 'Hello World', public_slug: 'hello-world' },
			configuration,
		})

		expect(result.payload.public_slug).toBeNull()
	})

	it('preserves an existing permalink by default when the slug changes', () => {
		const result = coordinateMutation({
			kind: 'update',
			payload: { title: 'Changed title' },
			existingItem: {
				title: 'Hello World',
				public_slug: 'hello-world',
				canonical_route: '/news/hello-world',
			},
			configuration,
		})

		expect(result.payload.public_slug).toBe('changed-title')
		expect(result.payload.canonical_route).toBeUndefined()
	})

	it('synchronizes a permalink only when configured', () => {
		const synchronizedConfiguration: CollectionConfiguration = {
			...configuration,
			permalinks: [
				{
					...configuration.permalinks[0]!,
					options: { ...configuration.permalinks[0]!.options, updateOnSlugChange: true },
				},
			],
		}
		const result = coordinateMutation({
			kind: 'update',
			payload: { title: 'Changed title' },
			existingItem: {
				title: 'Hello World',
				public_slug: 'hello-world',
				canonical_route: '/news/hello-world',
			},
			configuration: synchronizedConfiguration,
		})

		expect(result.payload.canonical_route).toBe('/news/changed-title')
	})

	it('lets explicit slug and permalink values win', () => {
		const result = coordinateMutation({
			kind: 'create',
			payload: {
				title: 'Hello World',
				public_slug: 'Custom Slug',
				canonical_route: '/special',
			},
			existingItem: {},
			configuration,
		})

		expect(result.payload.public_slug).toBe('custom-slug')
		expect(result.payload.canonical_route).toBe('/special')
	})

	it('supports independent standalone permalinks', () => {
		const standaloneConfiguration: CollectionConfiguration = {
			slugs: [],
			permalinks: [
				{
					field: 'manual_route',
					sort: 1,
					options: {
						generateFromSlug: false,
						updateOnSlugChange: false,
						validatePrefixOnManualInput: false,
						trailingSlash: false,
						enforceTrailingSlashOnManualInput: false,
						automaticRedirects: false,
					},
				},
			],
			warnings: [],
		}

		const result = coordinateMutation({
			kind: 'update',
			payload: { title: 'Unrelated' },
			existingItem: { manual_route: '/kept' },
			configuration: standaloneConfiguration,
		})

		expect(result.payload.manual_route).toBeUndefined()
	})

	it('recalculates only the selected field', () => {
		const result = coordinateMutation({
			kind: 'recalculate',
			payload: {},
			existingItem: {
				title: 'Hello World',
				public_slug: 'old-slug',
				canonical_route: '/news/old-slug',
			},
			configuration,
			fieldKeys: new Set(['canonical_route']),
		})

		expect(result.payload).toEqual({ canonical_route: '/news/old-slug' })
	})

	it('does not implicitly recalculate a dependent permalink', () => {
		const result = coordinateMutation({
			kind: 'recalculate',
			payload: {},
			existingItem: {
				title: 'Hello World',
				public_slug: 'old-slug',
				canonical_route: '/news/old-slug',
			},
			configuration,
			fieldKeys: new Set(['public_slug']),
		})

		expect(result.payload).toEqual({ public_slug: 'hello-world' })
	})
})
