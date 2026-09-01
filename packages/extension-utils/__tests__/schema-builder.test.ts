import pino from 'pino'
import { describe, expect, expectTypeOf, it } from 'vitest'

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

const logger = pino({ enabled: false })

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
