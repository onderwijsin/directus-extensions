import { describe, expect, it } from 'vitest'

import { envSchema } from '../src/loops-webhook-hook/env.schema'

describe('Loops environment configuration', () => {
	it('defaults to the light-plan processing behavior', () => {
		const options = envSchema.parse({})

		expect(options.LOOPS_SYNC_ENABLED).toBe(true)
		expect(options.LOOPS_WEBHOOK_EVENT_ALLOWLIST).toEqual([
			'campaign.email.sent',
			'contact.deleted',
		])
		expect(options.LOOPS_LMX_PARSING_MODE).toBe('best_effort')
		expect(options.LOOPS_API_BASE_URL).toBe('https://app.loops.so')
		expect(options.LOOPS_SYNC_ENABLED_FIELD).toBe('loops_sync_enabled')
	})

	it('accepts configurable event, parsing, and field settings', () => {
		const options = envSchema.parse({
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
})
