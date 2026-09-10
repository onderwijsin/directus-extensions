import { createRequire } from 'node:module'

import pino from 'pino'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
	defineCacheConfigSchema,
	defineDirectusStartupSchema,
	defineEmailConfigSchema,
	defineExtensionOptionsSchema,
	defineRedisConfigSchema,
	defineRequiredEmailConfigSchema,
	defineSynchronizationConfigSchema,
	validateExtensionOptions,
} from '../src/server'
import { isFunction, isRecord } from '../src/shared/guards'

const logger = pino({ enabled: false })

/**
 * Loads a real independent Zod runtime through its CommonJS entrypoint.
 * @returns A defaulted boolean from that runtime, narrowed without a cast.
 */
function createForeignDefault() {
	const runtime: unknown = createRequire(import.meta.url)('zod')
	if (!isRecord(runtime) || !isFunction(runtime.boolean)) {
		throw new Error('The CommonJS Zod entrypoint must export boolean')
	}
	const schema = runtime.boolean()
	if (!(schema instanceof z.ZodBoolean)) {
		throw new Error('The CommonJS Zod boolean factory must return a boolean schema')
	}
	expect(schema._zod.version).not.toBe(z.core.version)
	return schema.default(true)
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

	it('rejects a foreign defaulted field nested inside a supplied-runtime object', () => {
		const foreignDefault = createForeignDefault()
		const definition = defineDirectusStartupSchema((zod) => ({
			NESTED: zod.object({ ENABLED: foreignDefault }),
		}))

		expect(() => validateExtensionOptions({ NESTED: {} }, definition, logger)).toThrow(
			/supplied z/,
		)
		expect(() => validateExtensionOptions({ NESTED: {} }, definition, logger)).toThrow(/NESTED/)
	})

	it('rejects a foreign root returned by the general builder', () => {
		const foreignDefault = createForeignDefault()
		const definition = defineExtensionOptionsSchema(() => foreignDefault)

		expect(() => validateExtensionOptions(undefined, definition, logger)).toThrow(/supplied z/)
	})

	it.each([
		{ name: 'array', wrap: (foreign: z.ZodType) => z.array(foreign) },
		{ name: 'union', wrap: (foreign: z.ZodType) => z.union([z.string(), foreign]) },
		{
			name: 'intersection',
			wrap: (foreign: z.ZodType) => z.intersection(z.unknown(), foreign),
		},
		{ name: 'tuple rest', wrap: (foreign: z.ZodType) => z.tuple([z.string()], foreign) },
		{ name: 'record', wrap: (foreign: z.ZodType) => z.record(z.string(), foreign) },
		{ name: 'map', wrap: (foreign: z.ZodType) => z.map(z.string(), foreign) },
		{ name: 'set', wrap: (foreign: z.ZodType) => z.set(foreign) },
		{ name: 'optional', wrap: (foreign: z.ZodType) => z.optional(foreign) },
		{ name: 'nullable', wrap: (foreign: z.ZodType) => z.nullable(foreign) },
		{
			name: 'default',
			wrap: (foreign: z.ZodType) =>
				new z.ZodDefault({ type: 'default', innerType: foreign, defaultValue: true }),
		},
		{ name: 'prefault', wrap: (foreign: z.ZodType) => z.prefault(foreign, true) },
		{ name: 'catch', wrap: (foreign: z.ZodType) => z.catch(foreign, true) },
		{ name: 'readonly', wrap: (foreign: z.ZodType) => z.readonly(foreign) },
		{ name: 'pipe', wrap: (foreign: z.ZodType) => z.pipe(z.unknown(), foreign) },
		{ name: 'lazy', wrap: (foreign: z.ZodType) => z.lazy(() => foreign) },
		{ name: 'catchall', wrap: (foreign: z.ZodType) => z.object({}).catchall(foreign) },
		{ name: 'function output', wrap: (foreign: z.ZodType) => z.function({ output: foreign }) },
		{
			name: 'property check',
			wrap: (foreign: z.ZodType) =>
				z.object({ ENABLED: z.unknown() }).check(z.property('ENABLED', foreign)),
		},
	])('rejects foreign schemas hidden in $name before parsing', ({ wrap }) => {
		const foreignDefault = createForeignDefault()
		const definition = defineExtensionOptionsSchema(() => wrap(foreignDefault))

		expect(() => validateExtensionOptions(undefined, definition, logger)).toThrow(/supplied z/)
	})

	it('validates recursive lazy schemas without looping or resolving the factory twice', () => {
		interface Tree {
			ENABLED: boolean
			CHILDREN: Tree[]
		}
		let resolutions = 0
		const definition = defineExtensionOptionsSchema((zod) => {
			const tree: z.ZodType<Tree> = zod.lazy(() => {
				resolutions += 1
				return zod.object({
					ENABLED: zod.boolean().default(true),
					CHILDREN: zod.array(tree).default([]),
				})
			})
			return tree
		})

		expect(validateExtensionOptions({ CHILDREN: [{}] }, definition, logger)).toEqual({
			ENABLED: true,
			CHILDREN: [{ ENABLED: true, CHILDREN: [] }],
		})
		expect(resolutions).toBe(1)
	})

	it('does not inspect schema-valued data or execute default factories while checking ownership', () => {
		const foreignDefault = createForeignDefault()
		let defaults = 0
		const definition = defineExtensionOptionsSchema((zod) =>
			zod.object({
				DATA: zod.unknown().default(() => {
					defaults += 1
					return foreignDefault
				}),
			}),
		)

		expect(validateExtensionOptions({}, definition, logger).DATA).toBe(foreignDefault)
		expect(defaults).toBe(1)
	})

	it('preserves the legacy raw-schema path with an independent runtime', () => {
		const foreignDefault = createForeignDefault()

		expect(validateExtensionOptions(undefined, foreignDefault, logger)).toBe(true)
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
