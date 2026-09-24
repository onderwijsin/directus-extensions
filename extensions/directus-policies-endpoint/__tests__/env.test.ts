import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

import { envSchema, withPoliciesCacheDefault } from '../src/env.schema'

/**
 * Validates Policies options through the same normalized path as its endpoint and hook.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(env: Record<string, unknown>): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [
		withPoliciesCacheDefault(env),
		envSchema,
		{ info: vi.fn() },
	])
}

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

describe('policies composed environment configuration', () => {
	it('enables caching when CACHE_ENABLED is omitted', () => {
		expect(parseEnv({})).toMatchObject({ CACHE_ENABLED: true })
	})

	it('preserves explicit CACHE_ENABLED=false', () => {
		expect(parseEnv({ CACHE_ENABLED: false })).toMatchObject({ CACHE_ENABLED: false })
	})

	it('applies shared cache configuration validation', () => {
		expect(() => parseEnv({ CACHE_STORE: 'redis' })).toThrow(
			'Invalid extension options ☝. Exiting.',
		)
	})
})
