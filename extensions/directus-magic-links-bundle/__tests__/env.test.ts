import { describe, expect, it } from 'vitest'

import { envSchema as endpointEnvSchema } from '../src/magic-links-endpoint/env.schema'
import { envSchema as hookEnvSchema } from '../src/magic-links-hook/env.schema'

const validEnvironment = {
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
}

describe('magic-links environment schemas', () => {
	it('shares common defaults between endpoint and hook entries', () => {
		expect(endpointEnvSchema.parse(validEnvironment)).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: true,
			MAGIC_LINKS_COLLECTION: 'magic_links',
		})
		expect(hookEnvSchema.parse({})).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: true,
			MAGIC_LINKS_COLLECTION: 'magic_links',
		})
	})

	it('accepts endpoint-specific configuration', () => {
		const result = endpointEnvSchema.safeParse({
			...validEnvironment,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
			MAGIC_LINKS_TOKEN_SECRET: 'secret',
			MAGIC_LINKS_TOKEN_TTL: '30m',
			MAGIC_LINKS_EMAIL_TEMPLATE: 'magic-link',
		})

		expect(result.success).toBe(true)
	})

	it('accepts hook-specific schema and cleanup configuration', () => {
		const result = hookEnvSchema.safeParse({
			MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: false,
			MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR: false,
			MAGIC_LINKS_USE_LOCKED_SCHEMA_CHANGE: false,
			USE_MAGIC_LINK_CLEANUP: true,
			MAGIC_LINK_CLEANUP_WINDOW: '7d',
			MAGIC_LINK_CLEANUP_CRON: '0 * * * *',
		})

		expect(result.success).toBe(true)
	})

	it('rejects malicious or unsafe redirect allowlists', () => {
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['javascript:alert(1)'],
			}).success,
		).toBe(false)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_COLLECTION: 'directus_custom_links',
			}).success,
		).toBe(false)
	})

	it('rejects malformed durations and identifiers', () => {
		expect(
			endpointEnvSchema.safeParse({ ...validEnvironment, MAGIC_LINKS_TOKEN_TTL: 'forever' })
				.success,
		).toBe(false)
		expect(
			endpointEnvSchema.safeParse({ ...validEnvironment, MAGIC_LINKS_COLLECTION: 'bad-name' })
				.success,
		).toBe(false)
	})

	it('ignores unrelated Directus environment values', () => {
		const result = endpointEnvSchema.safeParse({
			...validEnvironment,
			SECRET: 'directus-secret',
		})

		expect(result.success).toBe(true)
		if (result.success) expect(result.data).not.toHaveProperty('SECRET')
	})
})
