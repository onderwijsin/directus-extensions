import { describe, expect, it } from 'vitest'

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
})
