import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { format } from 'oxfmt'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { envSchema } from '../src/env.schema'
import { collectionManagementSchema } from '../src/lib/collectionManagement'
import { resolveSeederConfig } from '../src/seeders/resolveConfig'
import {
	consumerConfigSchema,
	loadConsumerConfig,
	resolveSystemConfig,
} from '../src/seeders/resolveConfig'
import { SYSTEM_COLLECTIONS } from '../src/seeders/system/config'

let directory = ''
beforeEach(async () => {
	directory = await mkdtemp(path.join(tmpdir(), 'seeder-config-'))
})
afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

describe('system JSON consumer configuration', () => {
	it('retains defaults, merges independent properties and appends collections omitted from order', () => {
		expect(loadConsumerConfig()).toEqual({
			coreCollections: [],
			systemCollections: SYSTEM_COLLECTIONS,
			systemFieldOverrides: [],
		})
		expect(
			loadConsumerConfig().systemCollections.map(
				({ collection, operationMode, management }) => [
					collection,
					operationMode,
					management,
				],
			),
		).toEqual([
			['directus_policies', 'full-idempotent', { type: 'manifest' }],
			['directus_roles', 'full-idempotent', { type: 'manifest' }],
			['directus_users', 'full-idempotent', { type: 'manifest' }],
			['directus_access', 'full-idempotent', { type: 'manifest' }],
			['directus_presets', 'insert-update', undefined],
			[
				'directus_permissions',
				'full-idempotent',
				{ type: 'relation', field: 'policy', collection: 'directus_policies' },
			],
			['directus_folders', 'full-idempotent', { type: 'manifest' }],
			['directus_files', 'full-idempotent', { type: 'manifest' }],
			['directus_dashboards', 'full-idempotent', undefined],
			['directus_panels', 'full-idempotent', undefined],
			['directus_flows', 'full-idempotent', undefined],
			['directus_operations', 'full-idempotent', undefined],
			['directus_settings', 'insert-update', undefined],
			['directus_translations', 'full-idempotent', undefined],
		])
		const input = {
			system: {
				order: ['directus_translations', 'directus_presets'],
				collections: {
					directus_presets: {
						operationMode: 'full-idempotent',
						management: { type: 'id-range', min: 10, max: 50000 },
					},
					directus_roles: { fields: ['id'], filter: { name: { _eq: 'Editor' } } },
				},
			},
		}
		const effective = resolveSystemConfig(input)
		expect(effective.map(({ collection }) => collection)).toEqual([
			'directus_translations',
			'directus_presets',
			...SYSTEM_COLLECTIONS.map(({ collection }) => collection).filter(
				(name) => !input.system.order.includes(name),
			),
		])
		expect(effective[1]).toEqual({
			...SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_presets'),
			...input.system.collections.directus_presets,
		})
		expect(effective.find(({ collection }) => collection === 'directus_roles')).toEqual({
			collection: 'directus_roles',
			operationMode: 'full-idempotent',
			management: { type: 'manifest' },
			fields: ['id'],
			filter: { name: { _eq: 'Editor' } },
		})
		const cleared = resolveSystemConfig({
			system: {
				collections: {
					directus_presets: { filter: null, sort: null, fields: null, deep: null },
					directus_roles: { management: null },
				},
			},
		})
		expect(cleared.find(({ collection }) => collection === 'directus_presets')).toMatchObject({
			filter: null,
			fields: null,
			sort: null,
			deep: null,
		})
		const roles = cleared.find(({ collection }) => collection === 'directus_roles')
		expect(roles).toMatchObject({ operationMode: 'full-idempotent' })
		expect(roles).not.toHaveProperty('management')
		expect(
			SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_presets')?.filter,
		).toEqual({ user: { _null: true } })
	})

	it('uses declared core collections only, with mandatory modes and a priority-prefix order', async () => {
		const core = {
			collections: {
				categories: { operationMode: 'insert-update' },
				articles: {
					operationMode: 'full-idempotent',
					management: { type: 'manifest' },
					fields: ['id', 'title', 'category'],
				},
				feature_flags: { operationMode: 'insert-missing' },
			},
		}
		const filename = path.join(directory, 'core.json')
		await writeFile(filename, JSON.stringify({ core }))
		const settings = loadConsumerConfig(filename)
		expect(settings.coreCollections).toEqual(
			Object.entries(core.collections).map(([collection, entry]) => ({
				collection,
				...entry,
			})),
		)
		expect(settings.systemCollections).toEqual(SYSTEM_COLLECTIONS)
		await writeFile(filename, JSON.stringify({ core: { ...core, order: ['articles'] } }))
		expect(
			loadConsumerConfig(filename).coreCollections.map(({ collection }) => collection),
		).toEqual(['articles', 'categories', 'feature_flags'])
		const explicit = resolveSeederConfig(envSchema.parse({ SEEDER_CONFIG_PATH: filename }), {
			dataScope: 'core',
			operationMode: 'insert-missing',
		})
		expect(explicit.coreCollections?.map(({ operationMode }) => operationMode)).toEqual([
			'insert-missing',
			'insert-missing',
			'insert-missing',
		])
		expect(explicit.coreCollections?.[0]?.management).toEqual({ type: 'manifest' })
	})

	it('reuses query and management validation for core without system defaults', () => {
		const settings = {
			operationMode: 'full-idempotent',
			management: { type: 'relation', field: 'category', collection: 'categories' },
			fields: ['slug', 'title', 'category'],
			filter: { title: { _nnull: true } },
			sort: ['slug'],
			deep: { category: { _fields: ['slug'] } },
		}
		for (const name of ['constructor', 'toString', 'hasOwnProperty'])
			expect(
				consumerConfigSchema.parse({ core: { collections: { [name]: settings } } }).core
					?.collections[name],
			).toEqual(settings)
		const reserved: unknown = JSON.parse(
			'{"core":{"collections":{"__proto__":{"operationMode":"insert-missing"}}}}',
		)
		expect(consumerConfigSchema.safeParse(reserved).success).toBe(false)
		expect(
			consumerConfigSchema.parse({ core: { collections: { articles: settings } } }).core
				?.collections.articles,
		).toEqual(settings)
		for (const invalid of [
			{},
			{ operationMode: 'delete' },
			{ operationMode: 'insert-update', primaryKeyField: 'slug' },
			{ ...settings, management: { type: 'manifest', ids: [] } },
			{ ...settings, management: { type: 'id-range' } },
			{ ...settings, fields: 'id' },
			{ ...settings, filter: { title: { _bogus: true } } },
			{ ...settings, deep: { category: { _limti: 1 } } },
		])
			expect(
				consumerConfigSchema.safeParse({ core: { collections: { articles: invalid } } })
					.success,
			).toBe(false)
		for (const core of [
			{ collections: { directus_roles: settings } },
			{ collections: { '../articles': settings } },
			{ collections: { articles: settings }, order: ['missing'] },
			{ collections: { articles: settings }, order: ['articles', 'articles'] },
			{ collections: {}, unknown: true },
		])
			expect(consumerConfigSchema.safeParse({ core }).success).toBe(false)
	})

	it('loads JSON from the runtime path and reports missing, malformed and invalid explicit files with their path', async () => {
		const filename = path.join(directory, 'consumer.json')
		await writeFile(
			filename,
			JSON.stringify({
				system: {
					collections: {
						directus_presets: { management: { type: 'id-range', max: 50000 } },
						directus_roles: { fields: ['id'] },
						directus_policies: { fields: null },
						directus_flows: { fields: [] },
					},
				},
			}),
		)
		const loaded = loadConsumerConfig(filename)
		expect(
			loaded.systemCollections.find(({ collection }) => collection === 'directus_presets')
				?.management,
		).toEqual({ type: 'id-range', max: 50000 })
		expect(loaded.systemFieldOverrides).toEqual([
			'directus_roles',
			'directus_policies',
			'directus_flows',
		])
		for (const [collection, fields] of Object.entries({
			directus_presets: SYSTEM_COLLECTIONS.find(
				(entry) => entry.collection === 'directus_presets',
			)?.fields,
			directus_roles: ['id'],
			directus_policies: null,
			directus_flows: [],
		})) {
			expect(
				loaded.systemCollections.find((entry) => entry.collection === collection)?.fields,
			).toEqual(fields)
		}
		for (const contents of [
			'{broken',
			'{"system":{"collections":{"unknown":{}}}}',
			'{"system":{"collections":{"directus_roles":{"fields":"id"}}}}',
		]) {
			await writeFile(filename, contents)
			expect(() => loadConsumerConfig(filename)).toThrow(
				`Failed to load Seeder configuration "${filename}"`,
			)
			if (contents !== '{broken')
				expect(() => loadConsumerConfig(filename)).toThrow(
					`Failed to load Seeder configuration "${filename}": Invalid Seeder configuration:`,
				)
		}
		await rm(filename)
		expect(() => loadConsumerConfig(filename)).toThrow(/consumer.json.*ENOENT/su)
	})

	it('resolves declarative manifest management without runtime membership', () => {
		const management = { type: 'manifest' }
		const effective = resolveSystemConfig({
			system: { collections: { directus_access: { management } } },
		})
		expect(effective.find(({ collection }) => collection === 'directus_access')).toEqual({
			...SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_access'),
			management,
		})
		for (const extra of [{ ids: [] }, { path: 'other.json' }]) {
			expect(() =>
				resolveSystemConfig({
					system: {
						collections: {
							directus_access: {
								management: { ...management, ...extra },
							},
						},
					},
				}),
			).toThrow()
		}
	})

	it('resolves relation management for a supported source collection', () => {
		const management = { type: 'relation', field: 'policy', collection: 'directus_policies' }
		const collections = resolveSystemConfig({
			system: { collections: { directus_permissions: { management } } },
		})
		expect(
			collections.find(({ collection }) => collection === 'directus_permissions'),
		).toMatchObject({ management })
	})

	it.each([
		{ $comment: 1 },
		{ core: {} },
		{ system: { collections: { unknown: {} } } },
		{ system: { order: ['directus_roles', 'directus_roles'] } },
		{ system: { order: ['unknown'] } },
		...[
			{ operationMode: 'delete' },
			{ batchSize: 1 },
			{ continueOnError: true },
			{ fields: 'id' },
			{ fields: [2] },
			{ sort: true },
			{ filter: [] },
			{ filter: { user: 'bad' } },
			{ filter: { id: { _gte: 10, _lt: 20 } } },
			{ filter: { layout_options: { _json: { a: { b: { _eq: 1 } } } } } },
			{ filter: { user: { _null: 'true' } } },
			{ deep: { role: { _limit: '1' } } },
			{ deep: { role: { _limti: {} } } },
			{ deep: { role: { children: { _bogus: {} } } } },
			{ management: { type: 'id-range' } },
			{ management: { type: 'id-range', min: 20, max: 10 } },
			{ management: { type: 'id-range', max: '50000' } },
			...[
				{ field: 'policy', collection: 'unknown' },
				{ field: 'policy', collection: 'directus_extensions' },
				{ field: 'policy.id', collection: 'directus_policies' },
				{ field: 'policy', collection: '../directus_policies' },
				{ field: 'policy-name', collection: 'directus_policies' },
				{ field: 'policy', collection: 'directus_policies', ids: [] },
			].map((relation) => ({ management: { type: 'relation', ...relation } })),
		].map((overrides) => ({ system: { collections: { directus_presets: overrides } } })),
	])('rejects invalid config %# without fallback', (input) => {
		expect(() => resolveSystemConfig(input)).toThrow('Invalid Seeder configuration')
	})

	it('retains supported Directus logical and JSON predicates instead of narrowing them to incomplete framework types', () => {
		const filter = {
			_and: [{ id: { _gte: 1 } }],
			_or: [{ bookmark: { _null: true } }],
			layout_options: {
				_json: { _or: [{ enabled: { _eq: true } }, { enabled: { _null: true } }] },
			},
		}
		const config = resolveSystemConfig({
			system: {
				collections: { directus_presets: { filter, deep: { role: { _filter: filter } } } },
			},
		})
		expect(config.find(({ collection }) => collection === 'directus_presets')).toMatchObject({
			filter,
			deep: { role: { _filter: filter } },
		})
		expect(() =>
			resolveSystemConfig({
				system: {
					collections: {
						directus_presets: {
							filter: {
								geometry: { _intersects: { type: 'Point', coordinates: [1, 2] } },
							},
						},
					},
				},
			}),
		).not.toThrow()
	})

	it('uses consumer or built-in collection modes and applies an explicit CLI mode to every collection without changing management', async () => {
		const filename = path.join(directory, 'consumer.json')
		await writeFile(
			filename,
			JSON.stringify({
				system: {
					collections: {
						directus_permissions: {
							management: {
								type: 'relation',
								field: 'policy',
								collection: 'directus_policies',
							},
						},
						directus_presets: {
							operationMode: 'full-idempotent',
							management: { type: 'id-range', max: 50000 },
						},
					},
				},
			}),
		)
		const env = envSchema.parse({ SEEDER_CONFIG_PATH: filename })
		const config = resolveSeederConfig(env)
		expect(
			config.systemCollections?.find(({ collection }) => collection === 'directus_presets')
				?.operationMode,
		).toBe('full-idempotent')
		expect(
			config.systemCollections?.find(({ collection }) => collection === 'directus_roles')
				?.operationMode,
		).toBe('full-idempotent')
		expect(
			config.systemCollections?.find(({ collection }) => collection === 'directus_settings')
				?.operationMode,
		).toBe('insert-update')
		const explicit = resolveSeederConfig(env, { operationMode: 'insert-missing' })
		expect(
			new Set(explicit.systemCollections?.map((collection) => collection.operationMode)),
		).toEqual(new Set(['insert-missing']))
		expect(
			explicit.systemCollections?.find(({ collection }) => collection === 'directus_presets')
				?.management,
		).toEqual({ type: 'id-range', max: 50000 })
		expect(
			explicit.systemCollections?.find(
				({ collection }) => collection === 'directus_permissions',
			)?.management,
		).toEqual({ type: 'relation', field: 'policy', collection: 'directus_policies' })
	})

	// Regenerate the shipped schema with: pnpm exec vitest run extensions/directus-seeder-hook/__tests__/config.test.ts -t 'published JSON Schema' --update
	it('keeps the published JSON Schema generated from Zod and validates the shipped example', async () => {
		expect(z.toJSONSchema(collectionManagementSchema)).toMatchObject({
			oneOf: expect.arrayContaining([
				expect.objectContaining({ anyOf: [{ required: ['min'] }, { required: ['max'] }] }),
			]),
		})
		expect(
			z.toJSONSchema(consumerConfigSchema.shape.system.unwrap().shape.order.unwrap()),
		).toMatchObject({ uniqueItems: true })
		const formatted = await format(
			'seeder-config.schema.json',
			JSON.stringify(z.toJSONSchema(consumerConfigSchema, { reused: 'ref' }), null, '\t'),
			{ useTabs: true, tabWidth: 4, printWidth: 100 },
		)
		expect(formatted.errors).toEqual([])
		await expect(formatted.code).toMatchFileSnapshot('../seeder-config.schema.json')
		const example: unknown = JSON.parse(
			await readFile(new URL('../seeder.config.example.json', import.meta.url), 'utf8'),
		)
		expect(() => resolveSystemConfig(example)).not.toThrow()
	})
})
