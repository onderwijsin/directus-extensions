import type { FieldOverview, SchemaOverview } from '@directus/types'
import type { ResolvedCollectionManagement } from '../src/lib/collectionManagement'
import type { ServiceAdapter } from '../src/services/ServiceAdapter'

import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { getIdRangeFilters, validateManagedSeedData } from '../src/lib/collectionManagement'
import { OperationMode } from '../src/lib/config'
import { getManifestSeedIds, readManagedIds, updateManagedIds } from '../src/lib/manifestManagement'
import { createPerformanceTracker } from '../src/lib/performanceTracker'
import {
	getCollectionPrimaryKey,
	getCollectionPrimaryKeySchema,
	validateCollectionSeedKeys,
} from '../src/lib/primaryKey'
import { resolveCollectionManagement, validateRelationSeedKeys } from '../src/lib/resolveManagement'
import { createServiceAdapter } from '../src/services/ServiceAdapter'
import { createSeederStrategy } from '../src/strategies'

/**
 * Creates observable service operations without any database side effects.
 * @returns The strategy service and its spies.
 */
function createAdapter() {
	const getItems = vi.fn<ServiceAdapter['getItems']>().mockResolvedValue([])
	const createItems = vi.fn<ServiceAdapter['createItems']>().mockResolvedValue(['new'])
	const upsertItems = vi.fn<ServiceAdapter['upsertItems']>().mockResolvedValue(['old', 'new'])
	const deleteItems = vi.fn<ServiceAdapter['deleteItems']>().mockResolvedValue(['extra'])
	return {
		getItems,
		createItems,
		upsertItems,
		deleteItems,
		adapter: createServiceAdapter({ getItems, createItems, upsertItems, deleteItems }),
	}
}

describe('seed strategies', () => {
	it('insert-missing uses custom string keys to create absent records and preserve existing ones', async () => {
		const service = createAdapter()
		service.getItems.mockResolvedValue([{ code: 'old' }])
		const data = [
			{ code: 'old', id: 'irrelevant', value: 'preserve' },
			{ code: 'new', id: 'irrelevant', value: 'insert' },
		]
		const result = await createSeederStrategy(OperationMode.INSERT_MISSING).seedCollection(
			'fixture',
			data,
			service.adapter,
			createPerformanceTracker(),
			undefined,
			'code',
			false,
		)
		expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
			fields: ['code'],
			filter: { code: { _in: ['old', 'new'] } },
			limit: -1,
		})
		expect(service.createItems).toHaveBeenCalledExactlyOnceWith([data[1]])
		expect(service.upsertItems).not.toHaveBeenCalled()
		expect(service.deleteItems).not.toHaveBeenCalled()
		expect(result).toMatchObject({ created: 1, updated: 0, skipped: 1, deleted: 0, total: 2 })
	})

	it('insert-update batches custom numeric keys and counts existing versus new records', async () => {
		const service = createAdapter()
		service.getItems.mockResolvedValueOnce([{ code: 10 }]).mockResolvedValueOnce([])
		const data = [
			{ code: 10, id: 'irrelevant' },
			{ code: 11, id: 'irrelevant' },
		]
		const result = await createSeederStrategy(OperationMode.INSERT_UPDATE, 1).seedCollection(
			'fixture',
			data,
			service.adapter,
			createPerformanceTracker(),
			undefined,
			'code',
			false,
		)
		expect(service.getItems.mock.calls.map(([query]) => query)).toEqual([
			{ fields: ['code'], filter: { code: { _in: [10] } }, limit: -1 },
			{ fields: ['code'], filter: { code: { _in: [11] } }, limit: -1 },
		])
		expect(service.upsertItems.mock.calls.map(([batch]) => batch)).toEqual([
			[data[0]],
			[data[1]],
		])
		expect(service.deleteItems).not.toHaveBeenCalled()
		expect(result).toMatchObject({ created: 1, updated: 1, skipped: 0 })
	})

	it('full-idempotent deletes by the custom key and preserves whole-collection empty-data deletion', async () => {
		const service = createAdapter()
		service.getItems
			.mockResolvedValueOnce([{ code: 'old' }])
			.mockResolvedValueOnce([{ code: 'extra' }])
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			[{ code: 'old', id: 'irrelevant' }],
			service.adapter,
			createPerformanceTracker(),
			undefined,
			'code',
			false,
		)
		expect(service.getItems).toHaveBeenLastCalledWith({
			fields: ['code'],
			filter: { code: { _nin: ['old'] } },
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith(['extra'])
		expect(result).toMatchObject({ updated: 1, deleted: 1 })
		service.getItems.mockClear().mockResolvedValue([{ id: 'extra' }])
		service.deleteItems.mockClear()
		await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			[],
			service.adapter,
			createPerformanceTracker(),
		)
		expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
			fields: ['id'],
			filter: { id: { _nin: [] } },
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith(['extra'])
	})

	it('full-idempotent combines the managed interval with seed IDs for deletion', async () => {
		const service = createAdapter()
		const seeds = [{ id: 10 }, { id: 19 }]
		service.getItems.mockResolvedValueOnce([{ id: 10 }]).mockResolvedValueOnce([{ id: 11 }])
		service.deleteItems.mockResolvedValue([11])
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
			'fixture',
			seeds,
			service.adapter,
			createPerformanceTracker(),
			{ type: 'id-range', min: 10, max: 20 },
		)
		expect(service.upsertItems).toHaveBeenCalledExactlyOnceWith(seeds)
		expect(service.getItems).toHaveBeenLastCalledWith({
			fields: ['id'],
			filter: {
				_and: [{ id: { _gte: 10 } }, { id: { _lt: 20 } }, { id: { _nin: [10, 19] } }],
			},
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith([11])
		expect(result).toMatchObject({ created: 1, updated: 1, deleted: 1 })
	})

	it.each([
		{ bounds: { max: 50000 }, filter: { _lt: 50000 } },
		{ bounds: { min: 50001 }, filter: { _gte: 50001 } },
	])(
		'keeps $bounds when deleting with empty seeds and omits an empty _nin',
		async ({ bounds, filter }) => {
			const service = createAdapter()
			await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
				'fixture',
				[],
				service.adapter,
				createPerformanceTracker(),
				{ type: 'id-range', ...bounds },
			)
			expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
				fields: ['id'],
				filter: { _and: [{ id: filter }] },
				limit: -1,
			})
			expect(service.upsertItems).not.toHaveBeenCalled()
		},
	)

	it('bounds relation deletions independently of the current target seed IDs', async () => {
		const service = createAdapter()
		service.getItems.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 2 }])
		service.deleteItems.mockResolvedValue([2])
		const management = {
			type: 'relation',
			field: 'owner',
			collection: 'parents',
			ids: ['parent'],
		} satisfies Parameters<ReturnType<typeof createSeederStrategy>['seedCollection']>[4]
		const strategy = createSeederStrategy(OperationMode.FULL_IDEMPOTENT)
		const result = await strategy.seedCollection(
			'children',
			[{ id: 1, owner: 'parent' }],
			service.adapter,
			createPerformanceTracker(),
			management,
		)
		expect(result).toMatchObject({ created: 1, deleted: 1 })
		expect(service.getItems).toHaveBeenLastCalledWith({
			fields: ['id'],
			filter: { _and: [{ owner: { _in: ['parent'] } }, { id: { _nin: [1] } }] },
			limit: -1,
		})
		expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith([2])
		service.getItems.mockClear().mockResolvedValue([])
		await strategy.seedCollection(
			'children',
			[],
			service.adapter,
			createPerformanceTracker(),
			management,
		)
		expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
			fields: ['id'],
			filter: { _and: [{ owner: { _in: ['parent'] } }] },
			limit: -1,
		})
	})

	it('never queries or mutates an empty managed relation selection and fails closed without resolved IDs', async () => {
		const service = createAdapter()
		const strategy = createSeederStrategy(OperationMode.FULL_IDEMPOTENT)
		const management = {
			type: 'relation',
			field: 'owner',
			collection: 'parents',
			ids: [],
		} satisfies Parameters<typeof strategy.seedCollection>[4]
		expect(
			await strategy.seedCollection(
				'children',
				[],
				service.adapter,
				createPerformanceTracker(),
				management,
			),
		).toMatchObject({ deleted: 0 })
		expect(
			(
				await strategy.seedCollection(
					'children',
					[{ id: 1, owner: 'parent' }],
					service.adapter,
					createPerformanceTracker(),
					management,
				)
			).error,
		).toContain('inside the managed relation selection')
		expect(() =>
			validateManagedSeedData('children', [], {
				type: 'relation',
				field: 'owner',
				collection: 'parents',
			}),
		).toThrow('Invalid management')
		expect(service.getItems).not.toHaveBeenCalled()
		expect(service.createItems).not.toHaveBeenCalled()
		expect(service.upsertItems).not.toHaveBeenCalled()
		expect(service.deleteItems).not.toHaveBeenCalled()
	})

	it('rejects a later out-of-range seed before processing even the first batch', async () => {
		const service = createAdapter()
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT, 1).seedCollection(
			'fixture',
			[{ id: 10 }, { id: 20 }],
			service.adapter,
			createPerformanceTracker(),
			{ type: 'id-range', min: 10, max: 20 },
		)
		expect(result.error).toContain('ID 20 outside managed ID range [10, 20)')
		expect(service.getItems).not.toHaveBeenCalled()
		expect(service.createItems).not.toHaveBeenCalled()
		expect(service.upsertItems).not.toHaveBeenCalled()
		expect(service.deleteItems).not.toHaveBeenCalled()
	})

	it('rejects invalid management instead of silently widening the range or coercing bounds', () => {
		for (const management of [
			{ type: 'id-range' },
			{ type: 'id-range', min: 20, max: 10 },
			{ type: 'id-range', min: 10, max: 10 },
			{ type: 'id-range', max: '50000' },
			{ type: 'id-range', max: Infinity },
			{ type: 'id-range', min: NaN },
			{ type: 'id-range', max: Number.MAX_SAFE_INTEGER + 1 },
			{ type: 'id-range', min: 1.5 },
			{ type: 'id-range', max: 50000, typo: 1 },
			{ type: 'unknown', max: 50000 },
			null,
		]) {
			expect(() => validateManagedSeedData('fixture', [], management)).toThrow(
				'Invalid management for collection "fixture"',
			)
		}
	})

	it('requires explicit safe integer seed IDs and respects the inclusive lower bound', () => {
		const management = { type: 'id-range', min: 10 }
		expect(validateManagedSeedData('fixture', [{ id: 10 }], management)).toEqual(management)
		expect(() => validateManagedSeedData('fixture', [{ id: 9 }], management)).toThrow(
			'ID 9 outside managed ID range',
		)
		for (const seed of [
			{},
			{ id: '10' },
			{ id: null },
			{ id: 10.5 },
			{ id: Number.MAX_SAFE_INTEGER + 1 },
			null,
		]) {
			expect(() => validateManagedSeedData('fixture', [seed], management)).toThrow(
				'requires a safe integer numeric ID',
			)
		}
	})

	it('allows only ordered internal updates of an already validated managed ID', () => {
		const management = {
			type: 'relation',
			field: 'flow',
			collection: 'directus_flows',
			ids: ['flow'],
		}
		const full = { id: 'operation', flow: 'flow', resolve: null }
		const update = { id: 'operation', resolve: 'next', __isUpdateOnly: true }
		expect(() =>
			validateManagedSeedData('directus_operations', [full, update], management),
		).not.toThrow()
		for (const data of [
			[update, full],
			[full, { ...update, flow: null }],
			[full, { ...update, flow: 'outside' }],
			[full, { ...update, flow: { id: 'flow' } }],
			[full, { ...update, id: 'other' }],
			[full, { id: 'operation' }],
		]) {
			expect(() => validateManagedSeedData('directus_operations', data, management)).toThrow(
				'inside the managed relation selection',
			)
		}
	})

	it('uses upsert for an absent update-only item and retains insert-missing skips for an existing one', async () => {
		const service = createAdapter()
		const update = { id: 'operation', resolve: 'next', __isUpdateOnly: true }
		service.upsertItems.mockResolvedValue(['operation'])
		const strategy = createSeederStrategy(OperationMode.INSERT_MISSING)
		expect(
			await strategy.seedCollection(
				'directus_operations',
				[update],
				service.adapter,
				createPerformanceTracker(),
			),
		).toMatchObject({ updated: 1 })
		expect(service.upsertItems).toHaveBeenCalledExactlyOnceWith([
			{ id: 'operation', resolve: 'next' },
		])
		service.getItems.mockResolvedValue([{ id: 'operation' }])
		service.upsertItems.mockClear()
		expect(
			await strategy.seedCollection(
				'directus_operations',
				[update],
				service.adapter,
				createPerformanceTracker(),
			),
		).toMatchObject({ skipped: 1 })
		expect(service.upsertItems).not.toHaveBeenCalled()
	})

	it('retains partial progress and stops full-idempotent before deletion when an upsert fails', async () => {
		const service = createAdapter()
		service.upsertItems
			.mockResolvedValueOnce(['created'])
			.mockRejectedValueOnce(new Error('fixture failure'))
		const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT, 1).seedCollection(
			'fixture',
			[{ id: 'created' }, { id: 'failed' }, { id: 'unreached' }],
			service.adapter,
			createPerformanceTracker(),
		)
		expect(result).toMatchObject({ error: 'fixture failure', created: 1, deleted: 0, total: 3 })
		expect(service.upsertItems).toHaveBeenCalledTimes(2)
		expect(service.deleteItems).not.toHaveBeenCalled()
	})
})

/**
 * Models a real scalar field using the installed Directus schema contract.
 * @param field - Field name.
 * @param type - Live Directus scalar type.
 * @returns A non-alias field overview.
 */
function createField(field: string, type: FieldOverview['type']): FieldOverview {
	return {
		field,
		type,
		defaultValue: null,
		nullable: false,
		generated: false,
		dbType: null,
		precision: null,
		scale: null,
		special: [],
		note: null,
		validation: null,
		alias: false,
		searchable: true,
	}
}

/**
 * Models custom target/source primary keys and a direct scalar foreign key.
 * @param type - Target primary-key type.
 * @param sourceType - Source primary-key and foreign-key type.
 * @returns Schema fixture checked against the installed Directus types.
 */
function createSchema(
	type: FieldOverview['type'] = 'string',
	sourceType: FieldOverview['type'] = 'string',
) {
	return {
		collections: {
			children: {
				collection: 'children',
				primary: 'code',
				singleton: false,
				sortField: null,
				note: null,
				accountability: null,
				fields: {
					code: createField('code', type),
					owner: createField('owner', sourceType),
				},
			},
			parents: {
				collection: 'parents',
				primary: 'slug',
				singleton: false,
				sortField: null,
				note: null,
				accountability: null,
				fields: { slug: createField('slug', sourceType) },
			},
		},
		relations: [
			{
				collection: 'children',
				field: 'owner',
				related_collection: 'parents',
				meta: null,
				schema: {
					table: 'children',
					column: 'owner',
					foreign_key_table: 'parents',
					foreign_key_column: 'slug',
					constraint_name: null,
					on_update: null,
					on_delete: null,
				},
			},
		],
	} satisfies SchemaOverview
}

describe('schema primary keys', () => {
	it('rejects core metadata-shaped rows that omit their managed relation', () => {
		expect(() =>
			validateManagedSeedData(
				'children',
				[
					{ code: 'child', owner: 'parent' },
					{ code: 'child', __isUpdateOnly: true },
				],
				{ type: 'relation', field: 'owner', collection: 'parents', ids: ['parent'] },
				'code',
				false,
			),
		).toThrow('inside the managed relation selection')
	})

	it.each([
		{
			management: { type: 'id-range', min: 10, max: 20 },
			filters: [{ code: { _gte: 10 } }, { code: { _lt: 20 } }],
		},
		{
			management: { type: 'manifest', ids: [10, 11] },
			filters: [{ code: { _in: [10, 11] } }],
		},
		{
			management: {
				type: 'relation',
				field: 'owner',
				collection: 'parents',
				ids: ['parent'],
			},
			filters: [{ owner: { _in: ['parent'] } }],
		},
	] satisfies { management: ResolvedCollectionManagement; filters: unknown[] }[])(
		'bounds custom primary-key deletion with $management.type',
		async ({ management, filters }) => {
			const service = createAdapter()
			service.getItems.mockResolvedValueOnce([]).mockResolvedValueOnce([{ code: 11 }])
			service.deleteItems.mockResolvedValue([11])
			const result = await createSeederStrategy(OperationMode.FULL_IDEMPOTENT).seedCollection(
				'children',
				[{ code: 10, owner: 'parent' }],
				service.adapter,
				createPerformanceTracker(),
				management,
				'code',
				false,
			)
			expect(result.error).toBeUndefined()
			expect(service.getItems).toHaveBeenLastCalledWith({
				fields: ['code'],
				filter: {
					_and: [...filters, { code: { _nin: [10] } }],
				},
				limit: -1,
			})
			expect(service.deleteItems).toHaveBeenCalledExactlyOnceWith([11])
		},
	)

	it('retains numeric id-range validation and custom-key empty-seed bounds', async () => {
		const management = {
			type: 'id-range',
			min: 10,
			max: 20,
		} satisfies ResolvedCollectionManagement
		expect(getIdRangeFilters(management, 'code')).toEqual([
			{ code: { _gte: 10 } },
			{ code: { _lt: 20 } },
		])
		const service = createAdapter()
		const strategy = createSeederStrategy(OperationMode.FULL_IDEMPOTENT, 1)
		const result = await strategy.seedCollection(
			'children',
			[{ code: 10 }, { code: '11' }],
			service.adapter,
			createPerformanceTracker(),
			management,
			'code',
			false,
		)
		expect(result.error).toContain('requires a safe integer numeric ID')
		expect(service.getItems).not.toHaveBeenCalled()
		expect(service.upsertItems).not.toHaveBeenCalled()
		await strategy.seedCollection(
			'children',
			[],
			service.adapter,
			createPerformanceTracker(),
			management,
			'code',
			false,
		)
		expect(service.getItems).toHaveBeenCalledExactlyOnceWith({
			fields: ['code'],
			filter: { _and: [{ code: { _gte: 10 } }, { code: { _lt: 20 } }] },
			limit: -1,
		})
	})

	it('validates schema primary keys and every seed key without id fallback or coercion', () => {
		const schema = createSchema()
		expect(getCollectionPrimaryKey('children', schema)).toBe('code')
		expect(getCollectionPrimaryKeySchema('children', schema).parse('valid')).toBe('valid')
		expect(() =>
			validateCollectionSeedKeys('children', [{ code: 'valid' }], schema),
		).not.toThrow()
		for (const row of [
			{ id: 'wrong' },
			{ code: null },
			{ code: '' },
			{ code: 1 },
			null,
			'value',
			[],
		]) {
			expect(() =>
				validateCollectionSeedKeys('children', [{ code: 'valid' }, row], schema),
			).toThrow('at row 2')
		}
		expect(() =>
			validateCollectionSeedKeys('children', [{ code: 'same' }, { code: 'same' }], schema),
		).toThrow('at row 2')
		expect(() => getCollectionPrimaryKey('missing', schema)).toThrow(
			'requires a scalar primary key',
		)
		schema.collections.children.primary = 'id'
		expect(() => getCollectionPrimaryKey('children', schema)).toThrow(
			'requires a scalar primary key',
		)
		schema.collections.children.primary = ''
		expect(() => getCollectionPrimaryKey('children', schema)).toThrow(
			'requires a scalar primary key',
		)
		schema.collections.children.primary = 'code'
		schema.collections.children.fields.code.alias = true
		expect(() => getCollectionPrimaryKey('children', schema)).toThrow(
			'requires a scalar primary key',
		)
		for (const type of ['json', 'float', 'text', 'boolean'] satisfies FieldOverview['type'][]) {
			expect(() => getCollectionPrimaryKey('children', createSchema(type))).toThrow(
				'Unsupported primary key',
			)
		}
	})

	it.each(['integer', 'bigInteger'] satisfies FieldOverview['type'][])(
		'preflights safe %s keys without coercion',
		(type) => {
			const schema = createSchema(type)
			expect(() =>
				validateCollectionSeedKeys('children', [{ code: 0 }, { code: 42 }], schema),
			).not.toThrow()
			for (const code of ['42', 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, null]) {
				expect(() =>
					validateCollectionSeedKeys('children', [{ code: 0 }, { code }], schema),
				).toThrow('at row 2')
			}
		},
	)

	it('preserves canonical lowercase UUID validation for custom keys', () => {
		const schema = createSchema('uuid')
		const code = '11111111-1111-4111-8111-11111111111a'
		expect(() => validateCollectionSeedKeys('children', [{ code }], schema)).not.toThrow()
		expect(() =>
			validateCollectionSeedKeys('children', [{ code: code.toUpperCase() }], schema),
		).toThrow('Invalid seed primary key')
	})

	it.each([
		{ type: 'string', keys: ['a', 'Z', '10', '2', 'a'], expected: ['10', '2', 'Z', 'a'] },
		{ type: 'integer', keys: [10, 2, 10], expected: [2, 10] },
	] satisfies {
		type: FieldOverview['type']
		keys: (string | number)[]
		expected: (string | number)[]
	}[])(
		'unions, deduplicates and sorts manifests using custom $type primary keys',
		async ({ type, keys, expected }) => {
			const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'seeder-primary-'))
			onTestFinished(() => rm(directory, { recursive: true, force: true }))
			const schema = createSchema(type)
			const rows = keys.map((code) => ({ code, id: 'irrelevant' }))
			expect(getManifestSeedIds('children', rows, schema)).toEqual(keys)
			await updateManagedIds('children', rows.slice(0, 1), directory, schema, 2)
			await updateManagedIds('children', rows.slice(1), directory, schema, 2)
			expect(await readManagedIds('children', directory, schema)).toEqual(expected)
			expect(
				JSON.parse(
					await readFile(path.join(directory, 'children.managed-ids.json'), 'utf8'),
				),
			).toEqual(expected)
			expect(() => getManifestSeedIds('children', [{ id: keys[0] }], schema)).toThrow(
				'Invalid manifest-managed seed ID',
			)
			expect(() =>
				validateManagedSeedData(
					'children',
					rows,
					{ type: 'manifest', ids: keys.slice(0, 1) },
					'code',
					false,
				),
			).toThrow('inside the managed manifest selection')
		},
	)

	it.each([
		{ type: 'string', key: 'parent' },
		{ type: 'integer', key: 10 },
	] satisfies { type: FieldOverview['type']; key: string | number }[])(
		'resolves a relation from the actual source $type primary key',
		async ({ type, key }) => {
			const directory = await mkdtemp(
				path.join(await realpath(tmpdir()), 'seeder-relation-primary-'),
			)
			onTestFinished(() => rm(directory, { recursive: true, force: true }))
			const schema = createSchema('string', type)
			await writeFile(
				path.join(directory, 'parents.json'),
				JSON.stringify([{ slug: key, id: 'irrelevant' }]),
			)
			const management = {
				type: 'relation',
				field: 'owner',
				collection: 'parents',
			} satisfies Parameters<typeof resolveCollectionManagement>[1]
			expect(
				await resolveCollectionManagement('children', management, directory, schema),
			).toEqual({ ...management, ids: [key] })
			expect(() =>
				validateRelationSeedKeys('children', [{ code: 'valid' }], schema),
			).not.toThrow()
			expect(() => validateRelationSeedKeys('children', [{ id: 'wrong' }], schema)).toThrow(
				'Invalid relation-managed seed ID',
			)
			await writeFile(path.join(directory, 'parents.json'), JSON.stringify([{ id: key }]))
			await expect(
				resolveCollectionManagement('children', management, directory, schema),
			).rejects.toThrow('Invalid related seed ID')
		},
	)

	it('rejects unsafe relation schemas and invalid or duplicate source keys', async ({
		onTestFinished,
	}) => {
		const directory = await mkdtemp(
			path.join(await realpath(tmpdir()), 'seeder-relation-primary-'),
		)
		onTestFinished(() => rm(directory, { recursive: true, force: true }))
		const management = {
			type: 'relation',
			field: 'owner',
			collection: 'parents',
		} satisfies Parameters<typeof resolveCollectionManagement>[1]
		await writeFile(path.join(directory, 'parents.json'), JSON.stringify([{ slug: 'parent' }]))
		const invalidSchemas = [
			createSchema(),
			createSchema(),
			createSchema(),
			createSchema(),
			createSchema(),
			createSchema(),
		]
		const [wrongColumn, missingRelation, alias, wrongType, sourceAlias, targetAlias] =
			invalidSchemas
		if (
			!wrongColumn ||
			!missingRelation ||
			!alias ||
			!wrongType ||
			!sourceAlias ||
			!targetAlias
		)
			throw new Error('Missing test schema')
		const relation = wrongColumn.relations[0]
		if (!relation) throw new Error('Missing relation fixture')
		relation.schema.foreign_key_column = 'id'
		missingRelation.relations = []
		alias.collections.children.fields.owner.alias = true
		wrongType.collections.children.fields.owner.type = 'integer'
		sourceAlias.collections.parents.fields.slug.alias = true
		targetAlias.collections.children.fields.code.alias = true
		for (const schema of invalidSchemas) {
			await expect(
				resolveCollectionManagement('children', management, directory, schema),
			).rejects.toThrow('Failed to resolve relation management')
		}
		const schema = createSchema()
		for (const rows of [
			[{ slug: 'same' }, { slug: 'same' }],
			[{ slug: null }],
			[{ slug: { id: 'nested' } }],
		]) {
			await writeFile(path.join(directory, 'parents.json'), JSON.stringify(rows))
			await expect(
				resolveCollectionManagement('children', management, directory, schema),
			).rejects.toThrow('Failed to resolve relation management')
		}
	})
})
