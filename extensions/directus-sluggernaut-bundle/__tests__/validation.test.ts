import { describe, expect, it } from 'vitest'

import { recalculateOptionsSchema } from '../src/sluggernaut-recalculate/options.schema'

describe('Sluggernaut boundary schemas', () => {
	it('normalizes recalculation defaults and rejects unknown options', () => {
		expect(recalculateOptionsSchema.parse({ collection: 'posts' })).toEqual({
			collection: 'posts',
			fields: undefined,
			createRedirects: true,
		})
		expect(
			recalculateOptionsSchema.safeParse({ collection: 'posts', unexpected: true }).success,
		).toBe(false)
	})

	it('accepts the fields selected by the system-fields interface', () => {
		expect(recalculateOptionsSchema.parse({ collection: 'posts', fields: ['slug'] })).toEqual({
			collection: 'posts',
			fields: ['slug'],
			createRedirects: true,
		})
	})

	it('accepts fieldKeys as a legacy alias', () => {
		expect(
			recalculateOptionsSchema.parse({ collection: 'posts', fieldKeys: ['slug'] }),
		).toEqual({
			collection: 'posts',
			fields: ['slug'],
			createRedirects: true,
		})
	})
})
