import { describe, expect, it } from 'vitest'

import { locales, translations } from '../src/shared/configuration/locales'
import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'

describe('Sluggernaut configuration boundaries', () => {
	it('keeps locale values unique and translation keys aligned', () => {
		const values = locales.map(({ value }) => value)
		expect(new Set(values).size).toBe(values.length)
		for (const group of Object.values(translations))
			expect(Object.keys(group).sort()).toEqual([...values].sort())
	})

	it('validates environment identifiers, positive cache TTL, and feature gates', () => {
		expect(
			envSchema.safeParse({
				SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_$redirects',
				SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 1,
				SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 1,
			}).success,
		).toBe(true)
		expect(envSchema.parse({}).SLUGGERNAUT_THROW_ON_PROCESSING_ERROR).toBe(true)
		expect(envSchema.parse({}).SLUGGERNAUT_NORMALIZE_REDIRECTS).toBeUndefined()
		expect(
			envSchema.parse({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'trailing-slash' })
				.SLUGGERNAUT_NORMALIZE_REDIRECTS,
		).toBe('trailing-slash')
		expect(
			envSchema.parse({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'no-trailing-slash' })
				.SLUGGERNAUT_NORMALIZE_REDIRECTS,
		).toBe('no-trailing-slash')
		expect(envSchema.safeParse({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'invalid' }).success).toBe(
			false,
		)
		for (const value of ['', 'redirects-name', '1redirects', 'redirects/name']) {
			expect(envSchema.safeParse({ SLUGGERNAUT_REDIRECTS_COLLECTION: value }).success).toBe(
				false,
			)
		}
		expect(envSchema.safeParse({ SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 0 }).success).toBe(false)
		expect(envSchema.safeParse({ SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 0 }).success).toBe(false)
		expect(envSchema.safeParse({ SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 1.5 }).success).toBe(
			false,
		)
		expect(envSchema.safeParse({ SLUGGERNAUT_ENABLED: 'false' }).success).toBe(false)
	})
})
