import { validateExtensionOptions } from '@onderwijsin/directus-extension-utils/server'
import { describe, expect, it, vi } from 'vitest'

import { envSchema as operationEnvSchema } from '../src/coolify-deploy-operation/env.schema'
import { envSchema as endpointEnvSchema } from '../src/coolify-deployments-endpoint/env.schema'
import { envSchema as hookEnvSchema } from '../src/coolify-deployments-hook/env.schema'
import { withCoolifyCacheDefault } from '../src/shared/env'

const base = { COOLIFY_URL: 'https://coolify.example.com', COOLIFY_TOKEN: 'token' }

/**
 * Validates one Coolify entry's environment after applying the bundle cache default.
 * @param schema - Endpoint, hook, or operation options definition.
 * @param env - Environment values to validate.
 * @returns The validated options.
 */
function parseEnv(
	schema: typeof endpointEnvSchema | typeof hookEnvSchema | typeof operationEnvSchema,
	env: Record<string, unknown>,
): unknown {
	return Reflect.apply(validateExtensionOptions, undefined, [
		withCoolifyCacheDefault(env),
		schema,
		{ info: vi.fn() },
	])
}

describe('Coolify entry environment configuration', () => {
	it('preserves the bundle cache default and explicit disabling in every entry', () => {
		for (const schema of [endpointEnvSchema, hookEnvSchema, operationEnvSchema]) {
			expect(parseEnv(schema, base)).toMatchObject({ CACHE_ENABLED: true })
			expect(parseEnv(schema, { ...base, CACHE_ENABLED: false })).toMatchObject({
				CACHE_ENABLED: false,
			})
			expect(() => parseEnv(schema, { ...base, CACHE_ENABLED: null })).toThrow()
		}
	})

	it('keeps endpoint polling defaults and numeric coercion', () => {
		expect(parseEnv(endpointEnvSchema, base)).toMatchObject({
			COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: 5000,
			COOLIFY_APPLICATIONS_COLLECTION: 'coolify_applications',
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
		})
		expect(
			parseEnv(endpointEnvSchema, { ...base, COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: '750' }),
		).toMatchObject({ COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: 750 })
		expect(() =>
			parseEnv(endpointEnvSchema, { ...base, COOLIFY_DEPLOYMENTS_POLL_INTERVAL_MS: 249 }),
		).toThrow()
	})

	it('requires Redis configuration for the Redis cache store in every entry', () => {
		for (const schema of [endpointEnvSchema, hookEnvSchema, operationEnvSchema]) {
			expect(() => parseEnv(schema, { ...base, CACHE_STORE: 'memory' })).not.toThrow()
			expect(() => parseEnv(schema, { ...base, CACHE_STORE: 'redis' })).toThrow()
			expect(() =>
				parseEnv(schema, { ...base, CACHE_STORE: 'redis', REDIS: 'redis://localhost' }),
			).not.toThrow()
			expect(() =>
				parseEnv(schema, {
					...base,
					CACHE_STORE: 'redis',
					REDIS_ENABLED: true,
					REDIS_HOST: 'cache',
					REDIS_PORT: 6379,
					REDIS_USERNAME: 'default',
					REDIS_PASSWORD: 'secret',
				}),
			).not.toThrow()
		}
	})

	it('keeps entry-specific policy ID validation', () => {
		const policyId = 'custom-policy'
		expect(() =>
			parseEnv(endpointEnvSchema, {
				...base,
				COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: policyId,
			}),
		).not.toThrow()
		for (const schema of [hookEnvSchema, operationEnvSchema]) {
			expect(() =>
				parseEnv(schema, {
					...base,
					COOLIFY_DEPLOYMENTS_TRIGGER_DEPLOYMENTS_POLICY_ID: policyId,
				}),
			).toThrow()
		}
	})

	it('keeps Coolify URL and token required in every entry', () => {
		for (const schema of [endpointEnvSchema, hookEnvSchema, operationEnvSchema]) {
			expect(() => parseEnv(schema, { COOLIFY_TOKEN: 'token' })).toThrow()
			expect(() => parseEnv(schema, { COOLIFY_URL: base.COOLIFY_URL })).toThrow()
		}
	})
})
