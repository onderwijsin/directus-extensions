import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { format } from 'oxfmt'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { envSchema } from '../src/env.schema'
import { collectionManagementSchema } from '../src/lib/collectionManagement'
import { getCollectionMode } from '../src/lib/config'
import { resolveSeederConfig } from '../src/lib/resolveConfig'
import { SYSTEM_COLLECTIONS } from '../src/seeders/system/config'
import {
	consumerConfigSchema,
	loadSystemConfig,
	resolveSystemConfig,
} from '../src/seeders/system/resolveConfig'

let directory = ''
beforeEach(async () => {
	directory = await mkdtemp(path.join(tmpdir(), 'seeder-config-'))
})
afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

describe('system JSON consumer configuration', () => {
	it('retains defaults, merges independent properties and appends collections omitted from order', () => {
		expect(loadSystemConfig()).toEqual(SYSTEM_COLLECTIONS)
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
			fields: ['id'],
			filter: { name: { _eq: 'Editor' } },
		})
		const cleared = resolveSystemConfig({
			system: {
				collections: {
					directus_presets: { filter: null, sort: null, fields: null, deep: null },
				},
			},
		})
		expect(cleared.find(({ collection }) => collection === 'directus_presets')).toMatchObject({
			filter: null,
			fields: null,
			sort: null,
			deep: null,
		})
		expect(
			SYSTEM_COLLECTIONS.find(({ collection }) => collection === 'directus_presets')?.filter,
		).toEqual({ user: { _null: true } })
	})

	it('loads JSON from the runtime path and reports missing, malformed and invalid explicit files with their path', async () => {
		const filename = path.join(directory, 'consumer.json')
		await writeFile(
			filename,
			JSON.stringify({
				system: {
					collections: {
						directus_presets: { management: { type: 'id-range', max: 50000 } },
					},
				},
			}),
		)
		expect(
			loadSystemConfig(filename).find(({ collection }) => collection === 'directus_presets')
				?.management,
		).toEqual({ type: 'id-range', max: 50000 })
		for (const contents of ['{broken', '{"system":{"collections":{"unknown":{}}}}']) {
			await writeFile(filename, contents)
			expect(() => loadSystemConfig(filename)).toThrow(
				`Failed to load Seeder configuration "${filename}"`,
			)
		}
		await rm(filename)
		expect(() => loadSystemConfig(filename)).toThrow(/consumer.json.*ENOENT/su)
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
			{ management: null },
			{ management: { type: 'id-range' } },
			{ management: { type: 'id-range', min: 20, max: 10 } },
			{ management: { type: 'id-range', max: '50000' } },
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

	it('uses collection modes before global fallback and applies an explicit CLI mode to every collection without changing management', async () => {
		const filename = path.join(directory, 'consumer.json')
		await writeFile(
			filename,
			JSON.stringify({
				system: {
					collections: {
						directus_presets: {
							operationMode: 'full-idempotent',
							management: { type: 'id-range', max: 50000 },
						},
					},
				},
			}),
		)
		const env = envSchema.parse({ SEEDER_CONFIG_PATH: filename, SEEDER_MODE: 'insert-update' })
		const config = resolveSeederConfig(env)
		expect(
			config.systemCollections?.map((collection) => getCollectionMode(collection, config)),
		).toContain('full-idempotent')
		expect(
			config.systemCollections?.find(({ collection }) => collection === 'directus_roles')
				?.operationMode,
		).toBeUndefined()
		const role = config.systemCollections?.find(
			({ collection }) => collection === 'directus_roles',
		)
		if (!role) throw new Error('Missing role config')
		expect(getCollectionMode(role, config)).toBe('insert-update')
		const explicit = resolveSeederConfig(env, { operationMode: 'insert-missing' })
		expect(
			new Set(
				explicit.systemCollections?.map((collection) =>
					getCollectionMode(collection, explicit),
				),
			),
		).toEqual(new Set(['insert-missing']))
		expect(
			explicit.systemCollections?.find(({ collection }) => collection === 'directus_presets')
				?.management,
		).toEqual({ type: 'id-range', max: 50000 })
	})

	// Regenerate the shipped schema with: pnpm exec vitest run extensions/directus-seeder-hook/__tests__/config.test.ts -t 'published JSON Schema' --update
	it('keeps the published JSON Schema generated from Zod and validates the shipped example', async () => {
		expect(z.toJSONSchema(collectionManagementSchema)).toMatchObject({
			anyOf: [{ required: ['min'] }, { required: ['max'] }],
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
