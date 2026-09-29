import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

import { envSchema } from '../src/shared/env.schema'

/**
 * Validates through the public API using the logger method exercised on failure.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(env: Record<string, unknown>): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [env, envSchema, { info: vi.fn() }])
}

describe('Loops environment configuration', () => {
	it('defaults to the light-plan processing behavior', () => {
		const options = parseEnv({})

		expect(options).toMatchObject({
			LOOPS_SYNC_ENABLED: true,
			LOOPS_WEBHOOK_EVENT_ALLOWLIST: ['campaign.email.sent', 'contact.deleted'],
			LOOPS_LMX_PARSING_MODE: 'best_effort',
			LOOPS_API_BASE_URL: 'https://app.loops.so',
			LOOPS_SYNC_ENABLED_FIELD: 'loops_sync_enabled',
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
	})

	it('accepts configurable event, parsing, and field settings', () => {
		const options = parseEnv({
			LOOPS_WEBHOOK_EVENT_ALLOWLIST: ['testing.testEvent'],
			LOOPS_LMX_PARSING_MODE: 'strict',
			LOOPS_SYNC_ENABLED: false,
			LOOPS_SYNC_ENABLED_FIELD: 'marketing_opt_in',
		})

		expect(options).toMatchObject({
			LOOPS_WEBHOOK_EVENT_ALLOWLIST: ['testing.testEvent'],
			LOOPS_LMX_PARSING_MODE: 'strict',
			LOOPS_SYNC_ENABLED: false,
			LOOPS_SYNC_ENABLED_FIELD: 'marketing_opt_in',
		})
	})

	it('keeps blank secrets optional and rejects invalid shared startup configuration', () => {
		expect(parseEnv({ LOOPS_API_KEY: '  ', LOOPS_WEBHOOK_SIGNING_SECRET: '' })).toMatchObject({
			LOOPS_API_KEY: undefined,
			LOOPS_WEBHOOK_SIGNING_SECRET: undefined,
		})
		expect(() => parseEnv({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' })).toThrow(
			'Invalid extension options ☝. Exiting.',
		)
	})
})
