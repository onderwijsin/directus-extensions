import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/studio-docs-hook/env.schema'

/**
 * Validates Studio Docs options through the public builder API.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(env: Record<string, unknown>): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [env, envSchema, { info: vi.fn() }])
}

describe('Studio Docs environment configuration', () => {
	it('preserves defaults and shared startup configuration', () => {
		expect(parseEnv({})).toMatchObject({
			DIRECTUS_DOCS_ENABLED: true,
			DIRECTUS_DOCS_SEED_ENABLED: true,
			DIRECTUS_DOCS_SEEDING_STRATEGY: 'versioning',
			DIRECTUS_DOCS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_DOCS_SCHEMA_ABORT_ON_ERROR: true,
			DIRECTUS_DOCS_MANAGE_POLICY_ENABLED: true,
			DIRECTUS_DOCS_VIEW_POLICY_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
	})

	it('strips unknown values and rejects invalid seeding and lock configuration', () => {
		expect(parseEnv({ DIRECTUS_DOCS_COLLECTION: 'other_collection' })).not.toHaveProperty(
			'DIRECTUS_DOCS_COLLECTION',
		)
		expect(() => parseEnv({ DIRECTUS_DOCS_SEEDING_STRATEGY: 'replace' })).toThrow(
			'Invalid extension options ☝. Exiting.',
		)
		expect(() => parseEnv({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' })).toThrow(
			'Invalid extension options ☝. Exiting.',
		)
	})
})
