import { describe, expect, it } from 'vitest'

import { generateEnvironmentSecrets, responseIsReady, shouldStagePlayground } from './e2e.mjs'

describe('E2E runner helpers', () => {
	it('recognizes successful readiness responses', () => {
		expect(responseIsReady(new Response(null, { status: 200 }))).toBe(true)
		expect(responseIsReady(new Response(null, { status: 503 }))).toBe(false)
	})

	it('generates distinct secrets and disables Sentry', () => {
		const secrets = generateEnvironmentSecrets()

		expect(secrets.SENTRY_ENABLED).toBe('false')
		expect(secrets.DEFAULT_PASSWORD).toMatch(/^[a-f0-9]{64}$/u)
		expect(secrets.DIRECTUS_SECRET).toMatch(/^[a-f0-9]{64}$/u)
		expect(secrets.DEFAULT_PASSWORD).not.toBe(secrets.DIRECTUS_SECRET)
	})

	it('does not stage source when a packed playground build is available', () => {
		expect(shouldStagePlayground(true)).toBe(false)
		expect(shouldStagePlayground(false)).toBe(true)
	})
})
