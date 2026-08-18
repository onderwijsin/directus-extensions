import { describe, expect, it } from 'vitest'

import { runValueSmokeTest } from '../src/smoke/values'

describe('runValueSmokeTest', () => {
	it('keeps retry and async attempt results in their intended output fields', () => {
		const result = runValueSmokeTest({ collection: 'posts' }, 'retried', 'async')

		expect(result.object.rebuilt.retry).toBe('retried')
		expect(result.loggerFields.attempt).toBe('async')
	})
})
