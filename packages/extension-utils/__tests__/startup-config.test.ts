import { describe, expect, it } from 'vitest'

import { directusStartupSchema } from '../src/server/directus-ensure/config'

describe('directusStartupSchema', () => {
	it('provides the documented defaults', () => {
		expect(directusStartupSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
		})
	})

	it('accepts explicit global schema settings', () => {
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
			}).success,
		).toBe(true)
	})

	it('requires backend configuration for distributed providers', () => {
		expect(
			directusStartupSchema.safeParse({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'REDIS' }).success,
		).toBe(false)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'REDIS',
				DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: 'redis://localhost:6379',
			}).success,
		).toBe(true)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'FS',
				DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: '/tmp/directus-locks',
			}).success,
		).toBe(true)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'REDIS',
				REDIS: 'redis://localhost:6379',
			}).success,
		).toBe(true)
	})

	it('requires the Directus Redis connection for the distributed rate limiter', () => {
		expect(
			directusStartupSchema.safeParse({ DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis' })
				.success,
		).toBe(false)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis',
				REDIS: 'redis://localhost:6379',
			}).success,
		).toBe(true)
	})
})
