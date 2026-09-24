import { describe, expect, it } from 'vitest'

import { withPoliciesCacheDefault } from '../src/env.schema'

describe('policies cache environment default', () => {
	it('enables caching when the setting is omitted or undefined', () => {
		expect(withPoliciesCacheDefault({}).CACHE_ENABLED).toBe(true)
		expect(withPoliciesCacheDefault({ CACHE_ENABLED: undefined }).CACHE_ENABLED).toBe(true)
	})

	it('preserves explicit false and invalid values for schema validation', () => {
		expect(withPoliciesCacheDefault({ CACHE_ENABLED: false }).CACHE_ENABLED).toBe(false)
		expect(withPoliciesCacheDefault({ CACHE_ENABLED: null }).CACHE_ENABLED).toBeNull()
	})
})
