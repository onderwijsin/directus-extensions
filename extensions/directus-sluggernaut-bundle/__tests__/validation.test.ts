import { describe, expect, it } from 'vitest'

import { fieldMetadataSchema } from '../src/shared/configuration/field-metadata.schema'
import { linkDisplayOptionsSchema } from '../src/sluggernaut-link/options.schema'
import { recalculateOptionsSchema } from '../src/sluggernaut-recalculate/options.schema'

describe('Sluggernaut boundary schemas', () => {
	it('normalizes recalculation defaults and rejects unknown options', () => {
		expect(recalculateOptionsSchema.parse({ collection: 'posts' })).toEqual({
			collection: 'posts',
			createRedirects: true,
		})
		expect(
			recalculateOptionsSchema.safeParse({ collection: 'posts', unexpected: true }).success,
		).toBe(false)
	})

	it('accepts only usable field metadata', () => {
		expect(fieldMetadataSchema.safeParse({ field: 'title', meta: null }).success).toBe(true)
		expect(fieldMetadataSchema.safeParse({ field: 42 }).success).toBe(false)
	})

	it('rejects malformed display options before string handling', () => {
		expect(linkDisplayOptionsSchema.safeParse({ host: 8055 }).success).toBe(false)
	})
})
