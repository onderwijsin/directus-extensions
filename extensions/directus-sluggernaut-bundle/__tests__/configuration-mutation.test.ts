import type {
	CollectionConfiguration,
	SluggernautFieldMetadata,
} from '../src/shared/configuration/types'

import { describe, expect, it } from 'vitest'

import { discoverCollectionConfiguration } from '../src/shared/configuration/discovery'
import { coordinateMutation } from '../src/sluggernaut-hook/mutation/coordinator'
import { resolveSingleUpdateItemKey } from '../src/sluggernaut-hook/mutation/items'

const slugOptions = {
	sourceFields: ['title'],
	locale: 'en' as const,
	lowercase: true,
	updateOnSourceChange: true,
	automaticRedirects: false,
}

const permalinkOptions = {
	generateFromSlug: true,
	slugField: 'slug',
	updateOnSlugChange: true,
	prefix: '/articles',
	validatePrefixOnManualInput: false,
	trailingSlash: false,
	enforceTrailingSlashOnManualInput: false,
	automaticRedirects: false,
}

function configuration(
	options: {
		slug?: Partial<typeof slugOptions>
		permalink?: Partial<typeof permalinkOptions>
		sources?: string[]
		includeSlug?: boolean
		includePermalink?: boolean
	} = {},
): CollectionConfiguration {
	return {
		slugs:
			options.includeSlug === false
				? []
				: [
						{
							field: 'slug',
							sort: 1,
							options: {
								...slugOptions,
								...options.slug,
								sourceFields: options.sources ?? slugOptions.sourceFields,
							},
						},
					],
		permalinks:
			options.includePermalink === false
				? []
				: [
						{
							field: 'permalink',
							sort: 2,
							options: { ...permalinkOptions, ...options.permalink },
						},
					],
		warnings: [],
	}
}

describe('Sluggernaut configuration and mutation coordination', () => {
	it('rejects invalid explicit types at the coordinator boundary', () => {
		expect(() =>
			coordinateMutation({
				kind: 'create',
				payload: { slug: 42 },
				existingItem: {},
				configuration: configuration(),
			}),
		).toThrow('must receive a string')
		expect(() =>
			coordinateMutation({
				kind: 'create',
				payload: { permalink: { bad: true } },
				existingItem: {},
				configuration: configuration(),
			}),
		).toThrow('must receive a string')
	})
	it('discovers non-conventional, non-ASCII, and duplicate field ordering deterministically', () => {
		const fields: SluggernautFieldMetadata[] = [
			{ field: 'headline-with-hyphen' },
			{ field: 'headline_$value' },
			{ field: 'título' },
			{
				field: 'z_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: { ...slugOptions, sourceFields: ['headline-with-hyphen'] },
				},
			},
			{
				field: 'a_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: { ...slugOptions, sourceFields: ['headline_$value'] },
				},
			},
			{
				field: 'slug_duplicate',
				meta: {
					interface: 'sluggernaut-slug',
					options: { ...slugOptions, sourceFields: ['título'] },
				},
			},
		]
		const result = discoverCollectionConfiguration(fields)
		expect(result.slugs.map(({ field }) => field)).toEqual([
			'a_slug',
			'z_slug',
			'slug_duplicate',
		])
		expect(result.warnings.some(({ code }) => code === 'duplicate-slug-interface')).toBe(true)
	})

	it('ignores unrelated fields and updates while preserving derived values', () => {
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { notes: 'changed' },
				existingItem: { title: 'Stable', slug: 'stable', permalink: '/articles/stable' },
				configuration: configuration(),
			}).payload,
		).toEqual({ notes: 'changed' })
	})

	it('retains remaining sources and clears synchronized values when all sources clear', () => {
		const options = { sources: ['title', 'category'] }
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: null },
				existingItem: { title: 'Summer', category: 'News' },
				configuration: configuration(options),
			}).payload,
		).toMatchObject({ slug: 'news', permalink: '/articles/news' })
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: null, category: null },
				existingItem: {
					title: 'Summer',
					category: 'News',
					slug: 'summer-news',
					permalink: '/articles/summer-news',
				},
				configuration: configuration(options),
			}).payload,
		).toMatchObject({ slug: null, permalink: null })
	})

	it('respects disabled source updates, manual values, explicit dependent values, and existing sources', () => {
		const disabled = configuration({ slug: { updateOnSourceChange: false } })
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: 'Changed' },
				existingItem: { title: 'Original', slug: 'original' },
				configuration: disabled,
			}).payload,
		).toEqual({ title: 'Changed' })
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { slug: ' Manual Slug ' },
				existingItem: { title: 'Original', slug: 'original' },
				configuration: disabled,
			}).payload.slug,
		).toBe('manual-slug')
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { category: 'Updated' },
				existingItem: { title: 'Existing', category: 'Category' },
				configuration: {
					...configuration({ sources: ['title', 'category'] }),
					warnings: [],
				},
			}).payload.slug,
		).toBe('existing-updated')
		expect(
			coordinateMutation({
				kind: 'update',
				payload: { title: 'Changed', slug: ' Explicit Slug ', permalink: '/explicit/path' },
				existingItem: {},
				configuration: configuration(),
			}).payload,
		).toMatchObject({ slug: 'explicit-slug', permalink: '/explicit/path' })
	})

	it('keeps independent slug/permalink graphs isolated', () => {
		const result = coordinateMutation({
			kind: 'update',
			payload: { title: 'Second', category: 'Beta' },
			existingItem: {},
			configuration: {
				slugs: [
					{
						field: 'slug',
						sort: 1,
						options: { ...slugOptions, sourceFields: ['title'] },
					},
					{
						field: 'slug_secondary',
						sort: 3,
						options: { ...slugOptions, sourceFields: ['category'] },
					},
				],
				permalinks: [
					{ field: 'permalink', sort: 2, options: { ...permalinkOptions } },
					{
						field: 'permalink_secondary',
						sort: 4,
						options: {
							...permalinkOptions,
							slugField: 'slug_secondary',
							prefix: '/secondary',
						},
					},
				],
				warnings: [],
			},
		}).payload
		expect(result).toMatchObject({
			slug: 'second',
			permalink: '/articles/second',
			slug_secondary: 'beta',
			permalink_secondary: '/secondary/beta',
		})
	})

	it('supports standalone permalinks and ignores malformed references while valid fields survive', () => {
		const fields: SluggernautFieldMetadata[] = [
			{ field: 'title' },
			{ field: 'slug', meta: { interface: 'sluggernaut-slug', options: slugOptions } },
			{
				field: 'standalone',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { ...permalinkOptions, generateFromSlug: false, slugField: undefined },
				},
			},
			{
				field: 'invalid',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { ...permalinkOptions, slugField: 'other_collection.slug' },
				},
			},
		]
		const result = discoverCollectionConfiguration(fields)
		expect(result.slugs).toHaveLength(1)
		expect(result.permalinks.map(({ field }) => field)).toEqual(['standalone'])
		expect(result.warnings.some(({ code }) => code === 'invalid-slug-reference')).toBe(true)
	})

	it('rejects malformed bulk mutations before attempting item reads', () => {
		expect(() => resolveSingleUpdateItemKey(['one', 'two'])).toThrow('ambiguous bulk mutation')
		expect(() => resolveSingleUpdateItemKey([{ id: 1 }])).toThrow('scalar item key')
		expect(resolveSingleUpdateItemKey(['one'])).toBe('one')
		expect(resolveSingleUpdateItemKey([1])).toBe(1)
	})
})
