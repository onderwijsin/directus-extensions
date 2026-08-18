import { describe, expect, it } from 'vitest'

import { extensionsEnvSchema } from '../src/server/schema'
import { schemaChangeSchema } from '../src/server/schema-management/config'

describe('extensionsEnvSchema', () => {
	it('provides the documented defaults', () => {
		expect(extensionsEnvSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
			EXTENSIONS_RATE_LIMITER_STORE: 'memory',
		})
	})

	it('accepts redis rate limiter storage', () => {
		expect(
			extensionsEnvSchema.safeParse({
				EXTENSIONS_RATE_LIMITER_STORE: 'redis',
			}).success,
		).toBe(true)
	})

	it('rejects unsupported rate limiter storage', () => {
		expect(
			extensionsEnvSchema.safeParse({
				EXTENSIONS_RATE_LIMITER_STORE: 'filesystem',
			}).success,
		).toBe(false)
	})
})

describe('schemaChangeSchema', () => {
	it('includes the shared extension defaults', () => {
		expect(schemaChangeSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
			EXTENSIONS_RATE_LIMITER_STORE: 'memory',
		})
	})

	it('accepts explicit global schema settings', () => {
		expect(
			schemaChangeSchema.safeParse({
				DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
			}).success,
		).toBe(true)
	})

	it('requires backend configuration for distributed providers', () => {
		expect(
			schemaChangeSchema.safeParse({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'REDIS' }).success,
		).toBe(false)
		expect(
			schemaChangeSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'REDIS',
				DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: 'redis://localhost:6379',
			}).success,
		).toBe(true)
		expect(
			schemaChangeSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'FS',
				DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: '/tmp/directus-locks',
			}).success,
		).toBe(true)
	})
})
