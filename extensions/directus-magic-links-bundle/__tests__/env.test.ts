import { describe, expect, it } from 'vitest'

import { envSchema as endpointEnvSchema } from '../src/magic-links-endpoint/env.schema'
import { envSchema as hookEnvSchema } from '../src/magic-links-hook/env.schema'

const validEnvironment = {
	SECRET: 'directus-secret',
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
	EMAIL_TRANSPORT: 'smtp',
	EMAIL_SMTP_HOST: 'mailpit',
	EMAIL_SMTP_PORT: 1025,
	EMAIL_FROM: 'noreply@example.com',
}

describe('magic-links environment schemas', () => {
	it('shares common defaults between endpoint and hook entries', () => {
		expect(endpointEnvSchema.parse(validEnvironment)).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			MAGIC_LINKS_COLLECTION: 'magic_links',
		})
		expect(hookEnvSchema.parse({})).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
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
		if (result.success) expect(result.data.MAGIC_LINKS_REQUEST_RATE_LIMIT).toBe(5)
	})

	it('validates the request rate limit', () => {
		expect(
			endpointEnvSchema.parse({
				...validEnvironment,
				MAGIC_LINKS_REQUEST_RATE_LIMIT: '12',
			}).MAGIC_LINKS_REQUEST_RATE_LIMIT,
		).toBe(12)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_REQUEST_RATE_LIMIT: 0,
			}).success,
		).toBe(false)
	})

	it('requires selected transport prerequisites without requiring SMTP port or credentials', () => {
		expect(
			endpointEnvSchema.safeParse({ ...validEnvironment, EMAIL_TRANSPORT: 'sendmail' })
				.success,
		).toBe(true)
		expect(
			endpointEnvSchema.safeParse({ ...validEnvironment, EMAIL_SMTP_PORT: undefined })
				.success,
		).toBe(true)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				EMAIL_SMTP_USER: 'user',
			}).success,
		).toBe(true)
	})

	it('validates optional reply-to and sender configuration', () => {
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_EMAIL_REPLY_TO: 'support@example.com',
				MAGIC_LINKS_EMAIL_SENDER: 'Example <no-reply@example.com>',
			}).success,
		).toBe(true)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_EMAIL_REPLY_TO: 'not-an-email',
			}).success,
		).toBe(false)
		expect(
			endpointEnvSchema.safeParse({ ...validEnvironment, MAGIC_LINKS_EMAIL_SENDER: ' ' })
				.success,
		).toBe(false)
	})

	it('accepts optional email subject and preview text overrides', () => {
		const result = endpointEnvSchema.safeParse({
			...validEnvironment,
			MAGIC_LINKS_EMAIL_SUBJECT: 'Log in to Example',
			MAGIC_LINKS_EMAIL_PREVIEW_TEXT: 'Your secure login link is ready.',
		})

		expect(result.success).toBe(true)
	})

	it('accepts hook-specific schema and cleanup configuration', () => {
		const result = hookEnvSchema.safeParse({
			MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: false,
			MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR: false,
			USE_MAGIC_LINK_CLEANUP: true,
			MAGIC_LINK_CLEANUP_WINDOW: '7d',
			MAGIC_LINK_CLEANUP_CRON: '0 * * * *',
		})

		expect(result.success).toBe(true)
	})

	it('rejects invalid cleanup windows and cron expressions', () => {
		expect(hookEnvSchema.safeParse({ MAGIC_LINK_CLEANUP_WINDOW: 'forever' }).success).toBe(
			false,
		)
		expect(hookEnvSchema.safeParse({ MAGIC_LINK_CLEANUP_CRON: 'not-a-cron' }).success).toBe(
			false,
		)
	})

	it('accepts HTTP(S) redirect URLs with explicit ports', () => {
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [
					'http://localhost:3000/auth/magic-link',
					'https://app.example.com:8443/auth/magic-link',
				],
			}).success,
		).toBe(true)
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
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [
					'https://user:pass@app.example.com/auth/magic-link',
				],
			}).success,
		).toBe(false)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_COLLECTION: 'directus_custom_links',
			}).success,
		).toBe(false)
	})

	it('requires a non-empty redirect allowlist', () => {
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: undefined,
			}).success,
		).toBe(false)
		expect(
			endpointEnvSchema.safeParse({
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [],
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

	it('accepts the Directus SECRET fallback', () => {
		const result = endpointEnvSchema.safeParse(validEnvironment)

		expect(result.success).toBe(true)
		if (result.success) expect(result.data.SECRET).toBe('directus-secret')
	})
})
