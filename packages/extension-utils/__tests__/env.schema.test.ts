import { describe, expect, it } from 'vitest'

import { schemaChangeSchema } from '../src/server/env.schema'

describe('schemaChangeSchema', () => {
	it('provides the documented defaults', () => {
		expect(schemaChangeSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: true,
		})
	})

	it('accepts explicit global schema settings', () => {
		expect(
			schemaChangeSchema.safeParse({
				DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
				DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: false,
			}).success,
		).toBe(true)
	})
})
