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
				SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 1,
			}).success,
		).toBe(true)
		for (const value of ['', 'redirects-name', '1redirects', 'redirects/name']) {
			expect(envSchema.safeParse({ SLUGGERNAUT_REDIRECTS_COLLECTION: value }).success).toBe(
				false,
			)
		}
		expect(envSchema.safeParse({ SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 0 }).success).toBe(false)
		expect(envSchema.safeParse({ SLUGGERNAUT_ENABLED: 'false' }).success).toBe(false)
	})
})
