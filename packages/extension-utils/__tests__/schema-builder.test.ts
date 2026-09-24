import { createRequire } from 'node:module'

import pino from 'pino'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
	cacheConfig,
	cacheConfigSchema,
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

	it('supports options-only defaults and transforms with the package-owned Zod runtime', () => {
		const { version: foreignVersion } = createForeignDefault()
		const definition = defineExtensionOptionsSchema({
			options: (zod) => {
				expect(zod.core.version).toBe(z.core.version)
				expect(zod.core.version).not.toBe(foreignVersion)

				return {
					CATALOG_ENABLED: zod.boolean().default(true),
					CATALOG_LABEL: zod
						.string()
						.default(' catalog ')
						.transform((value) => value.trim()),
				}
			},
		})

		const options = validateExtensionOptions({}, definition, logger)

		expect(options.CATALOG_ENABLED).toBe(true)
		expect(options.CATALOG_LABEL).toBe('catalog')
		expectTypeOf(options.CATALOG_ENABLED).toEqualTypeOf<boolean>()
		expectTypeOf(options.CATALOG_LABEL).toEqualTypeOf<string>()
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
			options: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
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
			options: (z) => ({ CATALOG_EMAIL_ENABLED: z.boolean().default(true) }),
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

	it('validates shared defaults and transforms before overlapping constraints', () => {
		const stagedConfig = createExtensionOptionsConfigFragment<{
			SHARED_ENABLED: boolean
			SHARED_LIMIT: number
			SHARED_NOTE?: string
		}>({
			name: 'stagedConfig',
			shape: (z) => ({
				SHARED_ENABLED: z.boolean().default(true),
				SHARED_LIMIT: z.coerce
					.number()
					.int()
					.positive()
					.default(5)
					.transform((value) => value * 2),
				SHARED_NOTE: z.string().optional(),
			}),
		})
		const definition = defineExtensionOptionsSchema({
			include: [stagedConfig],
			options: (z) => ({
				OPTION_ONLY: z
					.string()
					.default(' default ')
					.transform((value) => value.trim()),
				SHARED_LIMIT: z
					.number()
					.max(10)
					.transform((value) => `ignored:${value}`),
			}),
		})
		const schema = resolveExtensionOptionsSchema(definition)

		const defaulted = validateExtensionOptions({}, definition, logger)
		expect(defaulted).toEqual({
			OPTION_ONLY: 'default',
			SHARED_ENABLED: true,
			SHARED_LIMIT: 10,
		})
		expectTypeOf(defaulted.OPTION_ONLY).toEqualTypeOf<string>()
		expectTypeOf(defaulted.SHARED_ENABLED).toEqualTypeOf<boolean>()
		expectTypeOf(defaulted.SHARED_LIMIT).toEqualTypeOf<number>()
		expectTypeOf(defaulted.SHARED_NOTE).toEqualTypeOf<string | undefined>()

		expect(
			validateExtensionOptions(
				{ OPTION_ONLY: ' explicit ', SHARED_LIMIT: '4' },
				definition,
				logger,
			),
		).toMatchObject({ OPTION_ONLY: 'explicit', SHARED_LIMIT: 8 })
		expect(schema.safeParse({ SHARED_LIMIT: '0' }).success).toBe(false)
		expect(schema.safeParse({ SHARED_LIMIT: '6' }).success).toBe(false)
	})

	it('applies an overlapping options constraint after the shared default', () => {
		const definition = defineExtensionOptionsSchema({
			include: [cacheConfig],
			options: (z) => ({ CACHE_ENABLED: z.literal(true) }),
		})
		const schema = resolveExtensionOptionsSchema(definition)

		expect(schema.safeParse({}).success).toBe(false)
		expect(schema.safeParse({ CACHE_ENABLED: false }).success).toBe(false)

		const options = validateExtensionOptions({ CACHE_ENABLED: true }, definition, logger)
		expect(options.CACHE_ENABLED).toBe(true)
		expectTypeOf(options.CACHE_ENABLED).toEqualTypeOf<true>()
		expectTypeOf(options.REDIS_ENABLED).toEqualTypeOf<boolean>()
	})

	it('keeps canonical shared values when overlapping schemas default or transform', () => {
		const defaultingDefinition = defineExtensionOptionsSchema({
			include: [cacheConfig],
			options: (z) => ({
				CACHE_STORE: z.enum(['memory', 'redis']).default('redis'),
			}),
		})
		const transformingDefinition = defineExtensionOptionsSchema({
			include: [cacheConfig],
			options: (z) => ({
				CACHE_STORE: z.enum(['memory', 'redis']).transform(() => 'redis'),
			}),
		})

		const defaulted = validateExtensionOptions({}, defaultingDefinition, logger)
		const transformed = validateExtensionOptions(
			{ CACHE_STORE: 'memory' },
			transformingDefinition,
			logger,
		)

		expect(defaulted.CACHE_STORE).toBeUndefined()
		expect(transformed.CACHE_STORE).toBe('memory')
		expect(cacheConfigSchema.safeParse(defaulted).success).toBe(true)
		expect(cacheConfigSchema.safeParse(transformed).success).toBe(true)
		expectTypeOf(defaulted.CACHE_STORE).toEqualTypeOf<'memory' | 'redis' | undefined>()
		expectTypeOf(transformed.CACHE_STORE).toEqualTypeOf<'memory' | 'redis'>()
	})

	it('rejects impossible shared and options constraints normally', () => {
		const stringConfig = createExtensionOptionsConfigFragment<{ SHARED_VALUE: string }>({
			name: 'stringConfig',
			shape: (z) => ({ SHARED_VALUE: z.string() }),
		})
		const definition = defineExtensionOptionsSchema({
			include: [stringConfig],
			options: (z) => ({ SHARED_VALUE: z.number() }),
		})
		const schema = resolveExtensionOptionsSchema(definition)

		expect(schema.safeParse({ SHARED_VALUE: 'shared-only' }).success).toBe(false)
		expect(schema.safeParse({ SHARED_VALUE: 42 }).success).toBe(false)
	})

	it('supports include-only composition with shared cross-field issues', () => {
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
			options: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
		})
		const cacheThenStartup = defineExtensionOptionsSchema({
			include: [cacheConfig, directusStartupConfig],
			options: (z) => ({ CATALOG_ENABLED: z.boolean().default(true) }),
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

	it('rejects duplicate top-level keys from distinct shared fragments clearly', () => {
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

		expect(() => validateExtensionOptions({}, duplicateFragments, logger)).toThrow(
			'Duplicate extension option key "SHARED_ENABLED" declared by "firstConfig" and "secondConfig"',
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
