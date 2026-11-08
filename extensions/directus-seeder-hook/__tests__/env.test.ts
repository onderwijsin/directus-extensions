import { describe, expect, it } from 'vitest'

import { envSchema } from '../src/env.schema'
import { getFolderPaths, resolveSeederConfig } from '../src/lib/resolveConfig'
import { SYSTEM_COLLECTIONS } from '../src/seeders/system/config'

describe('Seeder startup configuration', () => {
	it('provides all startup defaults and derives runtime configuration from them', () => {
		const options = envSchema.parse({})
		expect(options).toEqual({
			SEEDER_ENABLED: true,
			SEEDER_SCOPE: 'system',
			SEEDER_INCLUDE: [],
			SEEDER_EXCLUDE: [],
			SEEDER_CONTINUE_ON_ERROR: false,
			SEEDER_BATCH_SIZE: 50,
			SEEDER_ENABLE_FULL_IDEMPOTENT: false,
			SEEDER_JSON_ONLY: false,
			SEEDER_AUTO_EXTRACT: false,
			SEEDER_JSON_INDENT: 'tab',
			SEEDER_JSON_INDENT_SIZE: 2,
			SEEDER_SEEDS_DIR: '/directus/seeds',
			SEEDER_ASSETS_DIR: '/directus/seeds/system/assets',
			DEFAULT_EMAIL: 'admin@example.com',
			DEFAULT_PASSWORD: 'p4ssw0rd!',
			STORAGE_LOCATIONS: ['local'],
		})
		expect(resolveSeederConfig(options)).toEqual({
			coreCollections: [],
			systemCollections: SYSTEM_COLLECTIONS,
			systemFieldOverrides: [],
			dataScope: 'system',
			includeCollections: [],
			excludeCollections: [],
			continueOnError: false,
			batchSize: 50,
			enableFullIdempotent: false,
			skipClean: false,
			jsonOnly: false,
			autoExtract: false,
			jsonIndent: '\t',
		})
		expect(getFolderPaths(envSchema.parse({ SEEDER_SEEDS_DIR: ' /tmp/seeds ' }))).toEqual({
			seedsFolder: '/tmp/seeds/system',
			assetsFolder: '/directus/seeds/system/assets',
		})
		expect(
			getFolderPaths(
				envSchema.parse({
					SEEDER_SEEDS_DIR: '/tmp/seeds',
					SEEDER_ASSETS_DIR: '/directus/seeds/assets',
				}),
			),
		).toEqual({
			seedsFolder: '/tmp/seeds/system',
			assetsFolder: '/directus/seeds/assets',
		})
	})

	it.each([
		'SEEDER_ENABLED',
		'SEEDER_CONTINUE_ON_ERROR',
		'SEEDER_ENABLE_FULL_IDEMPOTENT',
		'SEEDER_JSON_ONLY',
		'SEEDER_AUTO_EXTRACT',
	])('accepts Directus booleans and rejects invalid %s values without coercion', (key) => {
		for (const value of [true, false])
			expect(envSchema.parse({ [key]: value })).toMatchObject({ [key]: value })
		for (const value of [null, '', 'true', 'false', 'yes', 0, 1, [], {}])
			expect(envSchema.safeParse({ [key]: value }).success).toBe(false)
	})

	it('validates integer batch sizes and indentation widths without truncation or fallback', () => {
		for (const size of [1, 50, 1000])
			expect(envSchema.parse({ SEEDER_BATCH_SIZE: size }).SEEDER_BATCH_SIZE).toBe(size)
		for (const size of [0, -1, 1.5, NaN, Infinity, null, '', '2', '7junk', true])
			expect(envSchema.safeParse({ SEEDER_BATCH_SIZE: size }).success).toBe(false)
		for (let size = 1; size <= 10; size++)
			expect(
				resolveSeederConfig(
					envSchema.parse({ SEEDER_JSON_INDENT: 'space', SEEDER_JSON_INDENT_SIZE: size }),
				).jsonIndent,
			).toBe(size)
		for (const size of [0, 11, -1, 2.5, NaN, Infinity, null, '', '2', true])
			expect(envSchema.safeParse({ SEEDER_JSON_INDENT_SIZE: size }).success).toBe(false)
	})

	it.each([
		'SEEDER_INCLUDE',
		'SEEDER_EXCLUDE',
		'SEEDER_AUTO_EXTRACT_INCLUDE',
		'STORAGE_LOCATIONS',
	])('normalizes single and pre-cast %s lists and validates their members', (key) => {
		expect(envSchema.parse({ [key]: ' directus_roles ' })).toMatchObject({
			[key]: ['directus_roles'],
		})
		expect(envSchema.parse({ [key]: [' directus_roles ', 'directus_users'] })).toMatchObject({
			[key]: ['directus_roles', 'directus_users'],
		})
		for (const value of [null, true, 1, {}, '', ' ', [''], [1], ['directus_roles', false]])
			expect(envSchema.safeParse({ [key]: value }).success).toBe(false)
	})

	it('allows empty collection selections but requires at least one storage location', () => {
		expect(envSchema.parse({ SEEDER_INCLUDE: [], SEEDER_EXCLUDE: [] })).toMatchObject({
			SEEDER_INCLUDE: [],
			SEEDER_EXCLUDE: [],
		})
		expect(envSchema.safeParse({ STORAGE_LOCATIONS: [] }).success).toBe(false)
	})

	it('requires a provided auto-extraction allowlist to contain known collections without re-splitting forced strings', () => {
		expect(envSchema.parse({}).SEEDER_AUTO_EXTRACT_INCLUDE).toBeUndefined()
		for (const value of [
			[],
			'unknown',
			['directus_roles', 'unknown'],
			'DIRECTUS_ROLES',
			'directus_roles,directus_policies',
		]) {
			const parsed = envSchema.safeParse({ SEEDER_AUTO_EXTRACT_INCLUDE: value })
			expect(parsed.success).toBe(false)
			if (!parsed.success)
				expect(parsed.error.issues[0]?.path[0]).toBe('SEEDER_AUTO_EXTRACT_INCLUDE')
		}
		const options = envSchema.parse({ SEEDER_AUTO_EXTRACT_INCLUDE: 'directus_roles' })
		expect(resolveSeederConfig(options)).toEqual(resolveSeederConfig(envSchema.parse({})))
	})

	it('normalizes the supported scope while rejecting unknown or mistyped options', () => {
		expect(envSchema.parse({ SEEDER_SCOPE: 'SYSTEM' }).SEEDER_SCOPE).toBe('system')
		for (const value of ['invalid', '', ' ', false, 1, null])
			expect(envSchema.safeParse({ SEEDER_SCOPE: value }).success).toBe(false)
	})

	it('preserves deployment names and credential strings, with all defaults owned by the schema', () => {
		for (const DEPLOYMENT_ENV of ['development', 'production', 'Development', 'staging', ''])
			expect(envSchema.parse({ DEPLOYMENT_ENV }).DEPLOYMENT_ENV).toBe(DEPLOYMENT_ENV)
		expect(
			envSchema.parse({ DEFAULT_EMAIL: '', DEFAULT_PASSWORD: '  secret  ' }),
		).toMatchObject({ DEFAULT_EMAIL: '', DEFAULT_PASSWORD: '  secret  ' })
		for (const key of ['DEPLOYMENT_ENV', 'DEFAULT_EMAIL', 'DEFAULT_PASSWORD'])
			for (const value of [null, false, 123, [], {}])
				expect(envSchema.safeParse({ [key]: value }).success).toBe(false)
		for (const key of ['SEEDER_SEEDS_DIR', 'SEEDER_ASSETS_DIR'])
			for (const value of ['', ' ', null, false, 123, []])
				expect(envSchema.safeParse({ [key]: value }).success).toBe(false)
		expect(envSchema.parse({ LOG_LEVEL: 123, CI: {}, DB_HOST: null })).not.toHaveProperty(
			'LOG_LEVEL',
		)
	})
})
