import { describe, expect, it } from 'vitest'

import { discoverCollectionConfiguration } from '../src/shared/configuration/discovery'

describe('Sluggernaut configuration discovery', () => {
	it('restores omitted Studio defaults from sparse persisted options', () => {
		const configuration = discoverCollectionConfiguration([
			{ field: 'title' },
			{
				field: 'slug',
				meta: {
					interface: 'sluggernaut-slug',
					options: { sourceFields: ['title'], automaticRedirects: true },
				},
			},
			{
				field: 'path',
				meta: {
					interface: 'sluggernaut-permalink',
					options: {
						slugField: 'slug',
						updateOnSlugChange: true,
						prefix: '/test',
						automaticRedirects: true,
					},
				},
			},
		])

		expect(configuration.warnings).toHaveLength(0)
		expect(configuration.slugs[0]?.options).toMatchObject({
			locale: 'en',
			lowercase: true,
			updateOnSourceChange: true,
			includeUnmanagedRedirectsInPlanning: true,
			unmanagedRedirectConflictBehavior: 'override',
		})
		expect(configuration.permalinks[0]?.options).toMatchObject({
			generateFromSlug: true,
			validatePrefixOnManualInput: false,
			trailingSlash: false,
			enforceTrailingSlashOnManualInput: false,
			includeUnmanagedRedirectsInPlanning: true,
			unmanagedRedirectConflictBehavior: 'override',
		})
	})

	it('sorts interfaces by Directus sort and field key', () => {
		const configuration = discoverCollectionConfiguration([
			{ field: 'title' },
			{ field: 'name' },
			{ field: 'fallback' },
			{
				field: 'z_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: {
						sourceFields: ['title'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
			{
				field: 'a_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: {
						sourceFields: ['name'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
			{
				field: 'null_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: null,
					options: {
						sourceFields: ['fallback'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
		])

		expect(configuration.slugs.map((field) => field.field)).toEqual([
			'a_slug',
			'z_slug',
			'null_slug',
		])
		expect(configuration.warnings).toHaveLength(1)
		expect(configuration.warnings[0]?.code).toBe('duplicate-slug-interface')
	})

	it('rejects invalid permalink slug references without disabling slug derivation', () => {
		const configuration = discoverCollectionConfiguration([
			{ field: 'title' },
			{
				field: 'route',
				meta: {
					interface: 'sluggernaut-permalink',
					options: {
						generateFromSlug: true,
						slugField: 'missing',
						updateOnSlugChange: false,
						validatePrefixOnManualInput: false,
						trailingSlash: false,
						enforceTrailingSlashOnManualInput: false,
						automaticRedirects: false,
					},
				},
			},
			{
				field: 'slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: {
						sourceFields: ['title'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
		])

		expect(configuration.slugs).toHaveLength(1)
		expect(configuration.permalinks).toHaveLength(0)
		expect(configuration.warnings[0]?.code).toBe('invalid-slug-reference')
	})

	it('accepts standalone permalinks without a slug field', () => {
		const configuration = discoverCollectionConfiguration([
			{
				field: 'route',
				meta: {
					interface: 'sluggernaut-permalink',
					options: {
						generateFromSlug: false,
						updateOnSlugChange: false,
						validatePrefixOnManualInput: false,
						trailingSlash: false,
						enforceTrailingSlashOnManualInput: false,
						automaticRedirects: false,
					},
				},
			},
		])

		expect(configuration.permalinks).toHaveLength(1)
		expect(configuration.warnings).toHaveLength(0)
	})

	it('excludes slug interfaces with missing source fields', () => {
		const configuration = discoverCollectionConfiguration([
			{
				field: 'slug',
				meta: {
					interface: 'sluggernaut-slug',
					options: {
						sourceFields: ['deleted_title'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
		])

		expect(configuration.slugs).toHaveLength(0)
		expect(configuration.warnings[0]?.code).toBe('invalid-source-reference')
	})

	it('warns and excludes malformed options while preserving independent fields', () => {
		const configuration = discoverCollectionConfiguration([
			{ field: 'headline text' },
			{
				field: 'good_slug',
				meta: {
					interface: 'sluggernaut-slug',
					options: {
						sourceFields: ['headline text'],
						locale: 'en',
						lowercase: true,
						updateOnSourceChange: true,
						automaticRedirects: false,
					},
				},
			},
			{
				field: 'bad_slug',
				meta: {
					interface: 'sluggernaut-slug',
					options: { sourceFields: ['headline text'], locale: 'en', lowercase: 'yes' },
				},
			},
			{
				field: 'standalone',
				meta: {
					interface: 'sluggernaut-permalink',
					options: {
						generateFromSlug: false,
						updateOnSlugChange: false,
						validatePrefixOnManualInput: false,
						trailingSlash: false,
						enforceTrailingSlashOnManualInput: false,
						automaticRedirects: false,
					},
				},
			},
		])
		expect(configuration.slugs.map(({ field }) => field)).toEqual(['good_slug'])
		expect(configuration.permalinks.map(({ field }) => field)).toEqual(['standalone'])
		expect(configuration.warnings).toEqual([
			expect.objectContaining({
				field: 'bad_slug',
				code: 'invalid-interface-options',
				message: expect.stringContaining('bad_slug'),
			}),
		])
	})
})
