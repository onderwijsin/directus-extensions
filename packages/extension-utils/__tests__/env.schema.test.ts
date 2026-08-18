import { describe, expect, it } from 'vitest'

import { schemaChangeSchema } from '../src/server/schema-management/config'

describe('schemaChangeSchema', () => {
	it('provides the documented defaults', () => {
		expect(schemaChangeSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'MEMORY',
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
