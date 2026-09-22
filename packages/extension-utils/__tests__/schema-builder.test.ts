import { createRequire } from 'node:module'

import pino from 'pino'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
	cacheConfig,
	defineCacheConfigSchema,
	defineDirectusStartupSchema,
	defineEmailConfigSchema,
	defineExtensionOptionsSchema,
	defineRedisConfigSchema,
	defineRequiredEmailConfigSchema,
	defineSynchronizationConfigSchema,
	directusStartupConfig,
	requiredEmailConfig,
	requiredEmailConfigSchema,
	redisConfig,
	synchronizationConfig,
	validateExtensionOptions,
} from '../src/server'
import {
	createExtensionOptionsConfigFragment,
	resolveExtensionOptionsSchema,
} from '../src/server/schema-builder'
import { isFunction, isRecord } from '../src/shared/guards'

const logger = pino({ enabled: false })

/**
 * Loads a real independent Zod runtime through its CommonJS entrypoint.
 * @returns A defaulted boolean and version object from that runtime.
 */
function createForeignDefault() {
	const runtime: unknown = createRequire(import.meta.url)('zod')
	if (!isRecord(runtime) || !isRecord(runtime.core) || !isFunction(runtime.boolean)) {
		throw new Error('The CommonJS Zod entrypoint must export boolean and core')
	}
	const schema = runtime.boolean()
	if (!(schema instanceof z.ZodBoolean)) {
		throw new Error('The CommonJS Zod boolean factory must return a boolean schema')
	}
	expect(runtime.core.version).not.toBe(z.core.version)
	return { schema: schema.default(true), version: runtime.core.version }
}

describe('extension options schema builders', () => {
	it('defines an opaque extension schema with inferred output', () => {
		const definition = defineExtensionOptionsSchema((z) =>
			z.object({
				CATALOG_ENABLED: z.boolean().default(true),
				CATALOG_URL: z.url(),
			}),
		)

		expect('safeParse' in definition).toBe(false)

		const options = validateExtensionOptions(
			{ CATALOG_URL: 'https://example.com' },
			definition,
			logger,
		)

		expect(options).toEqual({
			CATALOG_ENABLED: true,
			CATALOG_URL: 'https://example.com',
		})
		expectTypeOf(options).toEqualTypeOf<{
			CATALOG_ENABLED: boolean
			CATALOG_URL: string
		}>()
	})

	it('preserves nested defaults, transforms, and shared startup validation', () => {
		const definition = defineDirectusStartupSchema((zod) => ({
			NESTED: zod.object({
				ENABLED: zod.boolean().default(true),
				LIMIT: zod.coerce.number().int().positive().default(5),
				LABELS: zod.array(zod.string().transform((value) => value.trim())).default([]),
			}),
		}))

		const options = validateExtensionOptions(
			{ NESTED: { LIMIT: '8', LABELS: [' first '] } },
			definition,
			logger,
		)
		expect(options.NESTED).toEqual({ ENABLED: true, LIMIT: 8, LABELS: ['first'] })
		expect(options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED).toBe(true)
		expect(validateExtensionOptions({ NESTED: {} }, definition, logger).NESTED).toEqual({
			ENABLED: true,
			LIMIT: 5,
			LABELS: [],
		})
		expect(() =>
			validateExtensionOptions({ NESTED: { LIMIT: 0 } }, definition, logger),
		).toThrow('Invalid extension options ☝. Exiting.')
	})

	it('supplies its package-owned Zod runtime when another runtime is loaded', () => {
		const { version: foreignVersion } = createForeignDefault()
		const definition = defineDirectusStartupSchema((zod) => {
			expect(zod.core.version).toBe(z.core.version)
			expect(zod.core.version).not.toBe(foreignVersion)

			return {
				CATALOG_ENABLED: zod.boolean().default(true),
			}
		})

		expect(validateExtensionOptions({}, definition, logger).CATALOG_ENABLED).toBe(true)
	})

	it('supports a consumer-owned raw schema from an independent runtime', () => {
		const { schema: foreignDefault } = createForeignDefault()
		const options = validateExtensionOptions(undefined, foreignDefault, logger)

		expect(options).toBe(true)
		expectTypeOf(options).toEqualTypeOf<boolean>()
	})

	it('composes Directus startup fields without exposing the base schema', () => {
		const definition = defineDirectusStartupSchema((z) => ({
			CATALOG_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
		}))

		const options = validateExtensionOptions({}, definition, logger)

		expect(options).toMatchObject({
			CATALOG_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			SYNCHRONIZATION_STORE: 'memory',
		})
		expectTypeOf(options.CATALOG_SCHEMA_CHANGES_ENABLED).toEqualTypeOf<boolean>()
		expect(() =>
			validateExtensionOptions(
				{ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' },
				definition,
				logger,
			),
		).toThrow('Invalid extension options ☝. Exiting.')
	})

	it('composes Directus startup, cache, and extension-specific fields', () => {
		const definition = defineExtensionOptionsSchema({
			include: [directusStartupConfig, cacheConfig],
			extend: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
		})

		const options = validateExtensionOptions({}, definition, logger)

		expect(options).toMatchObject({
			CACHE_ENABLED: false,
			CATALOG_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			REDIS_ENABLED: false,
			SYNCHRONIZATION_STORE: 'memory',
		})
		expectTypeOf(options.CACHE_ENABLED).toEqualTypeOf<boolean>()
		expectTypeOf(options.CATALOG_ENABLED).toEqualTypeOf<boolean>()
		expectTypeOf(options.DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED).toEqualTypeOf<boolean>()
		expect(() =>
			validateExtensionOptions(
				{ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' },
				definition,
				logger,
			),
		).toThrow('Invalid extension options ☝. Exiting.')
	})

	it('composes Directus startup, required email, and extension-specific fields', () => {
		const definition = defineExtensionOptionsSchema({
			include: [directusStartupConfig, requiredEmailConfig],
			extend: (z) => ({ CATALOG_EMAIL_ENABLED: z.boolean().default(true) }),
		})

		const options = validateExtensionOptions(
			{ EMAIL_TRANSPORT: 'smtp', EMAIL_SMTP_HOST: 'smtp.example.com' },
			definition,
			logger,
		)

		expect(options).toMatchObject({
			CATALOG_EMAIL_ENABLED: true,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			EMAIL_SMTP_HOST: 'smtp.example.com',
			EMAIL_TRANSPORT: 'smtp',
		})
		expectTypeOf(options.EMAIL_TRANSPORT).toEqualTypeOf<
			'sendmail' | 'smtp' | 'mailgun' | 'ses'
		>()
		expect(() =>
			validateExtensionOptions({ EMAIL_TRANSPORT: 'smtp' }, definition, logger),
		).toThrow('Invalid extension options ☝. Exiting.')
	})

	it('preserves shared cross-field issues alongside field-level issues', () => {
		const definition = defineExtensionOptionsSchema({ include: [requiredEmailConfig] })
		const input = { EMAIL_TRANSPORT: 'smtp', EMAIL_SMTP_HOST: ' ' }
		const rawResult = requiredEmailConfigSchema.safeParse(input)
		const composedResult = resolveExtensionOptionsSchema(definition).safeParse(input)

		if (rawResult.success || composedResult.success) {
			throw new Error('Both required email schemas must reject a blank SMTP host')
		}
		if (!(composedResult.error instanceof z.ZodError)) {
			throw new Error('The composed schema must return a package-owned Zod error')
		}

		expect(composedResult.error.issues).toEqual(rawResult.error.issues)
	})

	it('produces equivalent behavior independent of include order', () => {
		const startupThenCache = defineExtensionOptionsSchema({
			include: [directusStartupConfig, cacheConfig],
			extend: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
		})
		const cacheThenStartup = defineExtensionOptionsSchema({
			include: [cacheConfig, directusStartupConfig],
			extend: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
		})
		const input = {
			CACHE_ENABLED: true,
			CACHE_STORE: 'redis',
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis',
			REDIS: 'redis://cache.example.com:6379',
		}

		expect(validateExtensionOptions(input, startupThenCache, logger)).toEqual(
			validateExtensionOptions(input, cacheThenStartup, logger),
		)
		expect(() =>
			validateExtensionOptions(
				{ CACHE_ENABLED: true, CACHE_STORE: 'redis' },
				startupThenCache,
				logger,
			),
		).toThrow('Invalid extension options ☝. Exiting.')
		expect(() =>
			validateExtensionOptions(
				{ CACHE_ENABLED: true, CACHE_STORE: 'redis' },
				cacheThenStartup,
				logger,
			),
		).toThrow('Invalid extension options ☝. Exiting.')
	})

	it('deduplicates direct and transitive shared dependencies by identity', () => {
		const definition = defineExtensionOptionsSchema({
			include: [
				redisConfig,
				synchronizationConfig,
				cacheConfig,
				directusStartupConfig,
				redisConfig,
			],
		})

		expect(validateExtensionOptions({}, definition, logger)).toMatchObject({
			CACHE_ENABLED: false,
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			REDIS_ENABLED: false,
			SYNCHRONIZATION_STORE: 'memory',
		})
	})

	it('rejects duplicate top-level option keys clearly', () => {
		const firstConfig = createExtensionOptionsConfigFragment<{ SHARED_ENABLED: boolean }>({
			name: 'firstConfig',
			shape: (z) => ({ SHARED_ENABLED: z.boolean() }),
		})
		const secondConfig = createExtensionOptionsConfigFragment<{ SHARED_ENABLED: boolean }>({
			name: 'secondConfig',
			shape: (z) => ({ SHARED_ENABLED: z.boolean() }),
		})
		const duplicateFragments = defineExtensionOptionsSchema({
			include: [secondConfig, firstConfig],
		})
		const duplicateExtensionField = defineExtensionOptionsSchema({
			include: [cacheConfig],
			extend: (z) => ({ CACHE_ENABLED: z.boolean() }),
		})

		expect(() => validateExtensionOptions({}, duplicateFragments, logger)).toThrow(
			'Duplicate extension option key "SHARED_ENABLED" declared by "firstConfig" and "secondConfig"',
		)
		expect(() => validateExtensionOptions({}, duplicateExtensionField, logger)).toThrow(
			'Duplicate extension option key "CACHE_ENABLED" declared by "cacheConfig" and "extend"',
		)
	})

	it('preserves shared configuration validation in specialized builders', () => {
		const cacheDefinition = defineCacheConfigSchema((z) => ({
			CATALOG_CACHE_NAMESPACE: z.string().default('catalog'),
		}))
		const emailDefinition = defineEmailConfigSchema((z) => ({
			CATALOG_EMAIL_ENABLED: z.boolean().default(true),
		}))
		const requiredEmailDefinition = defineRequiredEmailConfigSchema((z) => ({
			CATALOG_EMAIL_FROM_NAME: z.string().default('Catalog'),
		}))
		const redisDefinition = defineRedisConfigSchema((z) => ({
			CATALOG_REDIS_PREFIX: z.string().default('catalog'),
		}))
		const synchronizationDefinition = defineSynchronizationConfigSchema((z) => ({
			CATALOG_SYNCHRONIZATION_ENABLED: z.boolean().default(true),
		}))

		expect(validateExtensionOptions({}, cacheDefinition, logger)).toMatchObject({
			CACHE_ENABLED: false,
			CATALOG_CACHE_NAMESPACE: 'catalog',
		})
		expect(validateExtensionOptions({}, emailDefinition, logger)).toMatchObject({
			CATALOG_EMAIL_ENABLED: true,
			EMAIL_TRANSPORT: 'sendmail',
		})
		expect(validateExtensionOptions({}, requiredEmailDefinition, logger)).toMatchObject({
			CATALOG_EMAIL_FROM_NAME: 'Catalog',
			EMAIL_TRANSPORT: 'sendmail',
		})
		expect(validateExtensionOptions({}, redisDefinition, logger)).toMatchObject({
			CATALOG_REDIS_PREFIX: 'catalog',
			REDIS_ENABLED: false,
		})
		expect(validateExtensionOptions({}, synchronizationDefinition, logger)).toMatchObject({
			CATALOG_SYNCHRONIZATION_ENABLED: true,
			SYNCHRONIZATION_STORE: 'memory',
		})
		expect(() =>
			validateExtensionOptions({ EMAIL_TRANSPORT: 'smtp' }, requiredEmailDefinition, logger),
		).toThrow('Invalid extension options ☝. Exiting.')
		expect(() =>
			validateExtensionOptions(
				{ CACHE_ENABLED: true, CACHE_STORE: 'redis' },
				cacheDefinition,
				logger,
			),
		).toThrow('Invalid extension options ☝. Exiting.')
	})
})
