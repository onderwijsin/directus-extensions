/* oxlint-disable typescript/no-unsafe-call, typescript/no-unsafe-return */

import { describe, expect, it, vi } from 'vitest'

import { registerFieldCacheInvalidation } from '../src/sluggernaut-hook/configuration/cache-invalidation'

describe('Sluggernaut field cache invalidation', () => {
	it('registers all schema mutation events against the same cache owner', () => {
		const action = vi.fn()
		const clearCache = vi.fn()
		registerFieldCacheInvalidation({ action } as never, { clearCache } as never)
		expect(action.mock.calls.map(([event]) => event)).toEqual([
			'fields.create',
			'fields.update',
			'fields.delete',
		])
		for (const [, callback] of action.mock.calls) {
			expect(callback).toBeTypeOf('function')
			callback()
		}
		expect(clearCache).toHaveBeenCalledTimes(3)
	})
})
