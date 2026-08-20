import { describe, expect, it } from 'vitest'

import { discoverCollectionConfiguration } from '../src/shared/ordering'

describe('Sluggernaut configuration discovery', () => {
	it('sorts interfaces by Directus sort and field key', () => {
		const configuration = discoverCollectionConfiguration([
			{
				field: 'z_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: { sourceFields: ['title'] },
				},
			},
			{
				field: 'a_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: { sourceFields: ['name'] },
				},
			},
			{
				field: 'null_slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: null,
					options: { sourceFields: ['fallback'] },
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
			{
				field: 'route',
				meta: {
					interface: 'sluggernaut-permalink',
					options: { generateFromSlug: true, slugField: 'missing' },
				},
			},
			{
				field: 'slug',
				meta: {
					interface: 'sluggernaut-slug',
					sort: 1,
					options: { sourceFields: ['title'] },
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
					options: { generateFromSlug: false },
				},
			},
		])

		expect(configuration.permalinks).toHaveLength(1)
		expect(configuration.warnings).toHaveLength(0)
	})
})
