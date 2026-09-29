import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

import { locales, translations } from '../src/shared/configuration/locales'
import { envSchema } from '../src/sluggernaut-hook/configuration/env.schema'

/**
 * Validates Sluggernaut options through the public builder API.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(env: Record<string, unknown>): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [env, envSchema, { info: vi.fn() }])
}

describe('Sluggernaut configuration boundaries', () => {
	it('keeps locale values unique and translation keys aligned', () => {
		const values = locales.map(({ value }) => value)
		expect(new Set(values).size).toBe(values.length)
		for (const group of Object.values(translations))
			expect(Object.keys(group).sort()).toEqual([...values].sort())
	})

	it('validates environment identifiers, positive cache TTL, and feature gates', () => {
		expect(
			parseEnv({
				SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_$redirects',
				SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 1,
				SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 1,
			}),
		).toMatchObject({ SLUGGERNAUT_REDIRECTS_COLLECTION: 'custom_$redirects' })
		expect(parseEnv({})).toMatchObject({
			SLUGGERNAUT_ENABLED: true,
			SLUGGERNAUT_REDIRECTS_ENABLED: false,
			SLUGGERNAUT_THROW_ON_PROCESSING_ERROR: true,
			SLUGGERNAUT_REDIRECTS_COLLECTION: 'redirects',
			SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 25,
			SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 60_000,
			SLUGGERNAUT_SCHEMA_CHANGES_ENABLED: false,
			SLUGGERNAUT_SCHEMA_ABORT_ON_ERROR: true,
			SLUGGERNAUT_MANAGE_REDIRECTS_POLICY_ENABLED: false,
			SLUGGERNAUT_READ_ACTIVE_REDIRECTS_POLICY_ENABLED: false,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
		expect(parseEnv({})).not.toHaveProperty('SLUGGERNAUT_NORMALIZE_REDIRECTS')
		expect(parseEnv({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'trailing-slash' })).toMatchObject({
			SLUGGERNAUT_NORMALIZE_REDIRECTS: 'trailing-slash',
		})
		expect(parseEnv({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'no-trailing-slash' })).toMatchObject({
			SLUGGERNAUT_NORMALIZE_REDIRECTS: 'no-trailing-slash',
		})
		expect(() => parseEnv({ SLUGGERNAUT_NORMALIZE_REDIRECTS: 'invalid' })).toThrow()
		for (const value of ['', 'redirects-name', '1redirects', 'redirects/name']) {
			expect(() => parseEnv({ SLUGGERNAUT_REDIRECTS_COLLECTION: value })).toThrow()
		}
		expect(() => parseEnv({ SLUGGERNAUT_FIELDS_CACHE_TTL_MS: 0 })).toThrow()
		expect(() => parseEnv({ SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 0 })).toThrow()
		expect(() => parseEnv({ SLUGGERNAUT_MAX_REDIRECT_GRAPH_DEPTH: 1.5 })).toThrow()
		expect(() => parseEnv({ SLUGGERNAUT_ENABLED: 'false' })).toThrow()
		expect(() => parseEnv({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' })).toThrow()
	})
})
