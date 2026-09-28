import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

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

/**
 * Validates an entry's environment through the public builder API.
 * @param schema - Endpoint or hook options definition.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(
	schema: typeof endpointEnvSchema | typeof hookEnvSchema,
	env: Record<string, unknown>,
): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [env, schema, { info: vi.fn() }])
}

describe('magic-links environment schemas', () => {
	it('shares common defaults between endpoint and hook entries', () => {
		expect(parseEnv(endpointEnvSchema, validEnvironment)).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			MAGIC_LINKS_COLLECTION: 'magic_links',
		})
		expect(parseEnv(hookEnvSchema, {})).toMatchObject({
			MAGIC_LINKS_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			MAGIC_LINKS_COLLECTION: 'magic_links',
		})
	})

	it('accepts endpoint-specific configuration and coerces the request limit', () => {
		expect(
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
				MAGIC_LINKS_TOKEN_SECRET: 'secret',
				MAGIC_LINKS_TOKEN_TTL: '30m',
				MAGIC_LINKS_REQUEST_RATE_LIMIT: '12',
			}),
		).toMatchObject({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
			MAGIC_LINKS_TOKEN_SECRET: 'secret',
			MAGIC_LINKS_TOKEN_TTL: '30m',
			MAGIC_LINKS_REQUEST_RATE_LIMIT: 12,
		})
		expect(parseEnv(endpointEnvSchema, validEnvironment)).toMatchObject({
			MAGIC_LINKS_REQUEST_RATE_LIMIT: 5,
			MAGIC_LINKS_EMAIL_TEMPLATE: 'magic-link',
		})
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, MAGIC_LINKS_REQUEST_RATE_LIMIT: 0 }),
		).toThrow()
	})

	it('requires selected email transport prerequisites without extra SMTP requirements', () => {
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, EMAIL_TRANSPORT: 'sendmail' }),
		).not.toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, EMAIL_SMTP_PORT: undefined }),
		).not.toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, EMAIL_SMTP_USER: 'user' }),
		).not.toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				EMAIL_TRANSPORT: 'smtp',
				EMAIL_SMTP_HOST: undefined,
			}),
		).toThrow()
	})

	it('validates optional email overrides', () => {
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_EMAIL_REPLY_TO: 'support@example.com',
				MAGIC_LINKS_EMAIL_SENDER: 'Example <no-reply@example.com>',
				MAGIC_LINKS_EMAIL_SUBJECT: 'Log in to Example',
				MAGIC_LINKS_EMAIL_PREVIEW_TEXT: 'Your secure login link is ready.',
			}),
		).not.toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_EMAIL_REPLY_TO: 'not-an-email',
			}),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, MAGIC_LINKS_EMAIL_SENDER: ' ' }),
		).toThrow()
	})

	it('accepts hook-specific schema and cleanup configuration', () => {
		expect(
			parseEnv(hookEnvSchema, {
				MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: false,
				MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR: false,
				USE_MAGIC_LINK_CLEANUP: true,
				MAGIC_LINK_CLEANUP_WINDOW: '7d',
				MAGIC_LINK_CLEANUP_CRON: '0 * * * *',
			}),
		).toMatchObject({
			MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: false,
			USE_MAGIC_LINK_CLEANUP: true,
			MAGIC_LINK_CLEANUP_WINDOW: '7d',
		})
		expect(() => parseEnv(hookEnvSchema, { MAGIC_LINK_CLEANUP_WINDOW: 'forever' })).toThrow()
		expect(() => parseEnv(hookEnvSchema, { MAGIC_LINK_CLEANUP_CRON: 'not-a-cron' })).toThrow()
	})

	it('accepts HTTP(S) allowlists and rejects unsafe redirects', () => {
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [
					'http://localhost:3000/auth/magic-link',
					'https://app.example.com:8443/auth/magic-link',
				],
			}),
		).not.toThrow()
		for (const value of [
			'javascript:alert(1)',
			'https://user:pass@app.example.com/auth/magic-link',
		]) {
			expect(() =>
				parseEnv(endpointEnvSchema, {
					...validEnvironment,
					MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [value],
				}),
			).toThrow()
		}
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: [],
			}),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: undefined,
			}),
		).toThrow()
	})

	it('rejects malformed identifiers, durations, and missing required values', () => {
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_COLLECTION: 'bad-name',
			}),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				MAGIC_LINKS_COLLECTION: 'directus_custom_links',
			}),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, MAGIC_LINKS_TOKEN_TTL: 'forever' }),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, { ...validEnvironment, SECRET: undefined }),
		).toThrow()
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...validEnvironment,
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis',
			}),
		).toThrow()
	})

	it('accepts the Directus SECRET fallback', () => {
		expect(parseEnv(endpointEnvSchema, validEnvironment)).toMatchObject({
			SECRET: 'directus-secret',
		})
	})
})
