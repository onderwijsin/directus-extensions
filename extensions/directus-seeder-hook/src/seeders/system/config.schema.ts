import type { JsonValue } from '@directus/types'
import type { CollectionManagement } from '../../lib/collectionManagement'

import { z } from 'zod'

import { collectionManagementSchema } from '../../lib/collectionManagement'
import { OperationMode } from '../../lib/config'
import { SYSTEM_COLLECTIONS } from './config'

type QueryObject = Record<string, JsonValue>

const fieldNameSchema = z.string().min(1)
const fieldsSchema = z.array(fieldNameSchema)
const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const comparableSchema = z.union([z.string(), z.number()])

// Validate Directus query shapes without evaluating filters or resolving database fields.
const valueOperatorsSchema = z
	.strictObject({
		_eq: scalarSchema.optional(),
		_neq: scalarSchema.optional(),
		_lt: comparableSchema.optional(),
		_lte: comparableSchema.optional(),
		_gt: comparableSchema.optional(),
		_gte: comparableSchema.optional(),
		_in: z.array(comparableSchema).optional(),
		_nin: z.array(comparableSchema).optional(),
		_null: z.boolean().optional(),
		_nnull: z.boolean().optional(),
		_contains: z.string().optional(),
		_ncontains: z.string().optional(),
		_icontains: z.string().optional(),
		_starts_with: z.string().optional(),
		_nstarts_with: z.string().optional(),
		_istarts_with: z.string().optional(),
		_nistarts_with: z.string().optional(),
		_ends_with: z.string().optional(),
		_nends_with: z.string().optional(),
		_iends_with: z.string().optional(),
		_niends_with: z.string().optional(),
		_between: z.array(comparableSchema).length(2).optional(),
		_nbetween: z.array(comparableSchema).length(2).optional(),
		_empty: z.boolean().optional(),
		_nempty: z.boolean().optional(),
		_intersects: z.union([z.string(), z.record(z.string(), z.json())]).optional(),
		_nintersects: z.union([z.string(), z.record(z.string(), z.json())]).optional(),
		_intersects_bbox: z.union([z.string(), z.record(z.string(), z.json())]).optional(),
		_nintersects_bbox: z.union([z.string(), z.record(z.string(), z.json())]).optional(),
	})
	.refine(
		(operators) => Object.values(operators).filter((value) => value !== undefined).length <= 1,
		{ error: 'Use _and with one operator per field predicate' },
	)
	.meta({ maxProperties: 1 })

const operatorsSchema = z
	.strictObject({
		...valueOperatorsSchema.shape,
		/**
		 * Allows flat JSON paths, with recursion only through logical predicates.
		 * @returns Optional JSON filter schema.
		 */
		get _json(): z.ZodOptional<typeof jsonFilterSchema> {
			return jsonFilterSchema.optional()
		},
	})
	.refine(
		(operators) => Object.values(operators).filter((value) => value !== undefined).length <= 1,
		{ error: 'Use _and with one operator per field predicate' },
	)
	.meta({ maxProperties: 1 })

const logicalKeys = ['_and', '_or', '_some', '_none']
const filterSchema: z.ZodType<QueryObject> = z.lazy(() =>
	z
		.object({ _and: z.array(filterSchema).optional(), _or: z.array(filterSchema).optional() })
		.catchall(z.union([operatorsSchema, filterSchema]))
		.superRefine((node, context) => {
			const unknown = Object.keys(node).filter(
				(key) => key.startsWith('_') && !logicalKeys.includes(key),
			)
			if (unknown.length > 0) context.addIssue({ code: 'unrecognized_keys', keys: unknown })
		})
		.meta({ propertyNames: { anyOf: [{ pattern: '^[^_]' }, { enum: logicalKeys }] } }),
)

// Directus JSON predicates use flat paths (for example "a.b"), unlike relational filters.
const jsonFilterSchema: z.ZodType<QueryObject> = z.lazy(() =>
	z
		.object({
			_and: z.array(jsonFilterSchema).optional(),
			_or: z.array(jsonFilterSchema).optional(),
		})
		.catchall(valueOperatorsSchema)
		.superRefine((node, context) => {
			const unknown = Object.keys(node).filter(
				(key) => key.startsWith('_') && key !== '_and' && key !== '_or',
			)
			if (unknown.length > 0) context.addIssue({ code: 'unrecognized_keys', keys: unknown })
		})
		.meta({ propertyNames: { anyOf: [{ pattern: '^[^_]' }, { enum: ['_and', '_or'] }] } }),
)

const aggregateSchema = z.strictObject({
	avg: fieldsSchema.optional(),
	avgDistinct: fieldsSchema.optional(),
	count: fieldsSchema.optional(),
	countDistinct: fieldsSchema.optional(),
	min: fieldsSchema.optional(),
	max: fieldsSchema.optional(),
	sum: fieldsSchema.optional(),
	sumDistinct: fieldsSchema.optional(),
})
const deepOptionsSchema = z.strictObject({
	_alias: z.record(z.string(), z.string()).nullish(),
	_fields: fieldsSchema.nullish(),
	_sort: fieldsSchema.nullish(),
	_filter: filterSchema.nullish(),
	_limit: z.int().min(-1).nullish(),
	_offset: z.int().nonnegative().nullish(),
	_page: z.int().positive().nullish(),
	_search: z.string().nullish(),
	_group: fieldsSchema.nullish(),
	_aggregate: aggregateSchema.nullish(),
})
const deepSchema: z.ZodType<QueryObject> = z.lazy(() =>
	z.record(fieldNameSchema.regex(/^[^_]/u), deepNodeSchema),
)
const deepNodeSchema: z.ZodType<QueryObject> = z.lazy(() =>
	z
		.object(deepOptionsSchema.shape)
		.catchall(deepNodeSchema)
		.superRefine((node, context) => {
			const unknown = Object.keys(node).filter(
				(key) => key.startsWith('_') && !Object.hasOwn(deepOptionsSchema.shape, key),
			)
			if (unknown.length > 0) context.addIssue({ code: 'unrecognized_keys', keys: unknown })
		})
		.meta({
			propertyNames: {
				anyOf: [{ pattern: '^[^_]' }, { enum: Object.keys(deepOptionsSchema.shape) }],
			},
		}),
)

// Preserve the existing system source allowlist independently of application collections.
const systemManagementSchema: z.ZodType<CollectionManagement> = z.discriminatedUnion('type', [
	collectionManagementSchema.options[0],
	collectionManagementSchema.options[1].extend({
		collection: z.enum(
			SYSTEM_COLLECTIONS.map(({ collection }) => collection).filter(
				(name) => name !== 'directus_extensions',
			),
		),
	}),
	collectionManagementSchema.options[2],
])

/** Collection properties consumers can replace independently; nested values replace in full. */
export const collectionOverridesSchema = z.strictObject({
	operationMode: z.enum(OperationMode).optional(),
	fields: fieldsSchema.nullish(),
	filter: filterSchema.nullish(),
	sort: fieldsSchema.nullish(),
	deep: deepSchema.nullish(),
	management: systemManagementSchema.nullish(),
})

/** Effective built-in or consumer-overridden system collection. */
export const systemCollectionSchema = z.strictObject({
	collection: fieldNameSchema,
	...collectionOverridesSchema.shape,
	operationMode: z.enum(OperationMode),
	management: systemManagementSchema.optional(),
})

/** Safe application collection identifier, excluding Directus-owned collections. */
export const coreCollectionNameSchema = z
	.string()
	.regex(/^(?!directus_|__proto__$)[A-Za-z_][A-Za-z0-9_]*$/u)

/** Core has no package defaults: every declared collection must choose its import mode. */
export const coreCollectionOverridesSchema = z.strictObject({
	...collectionOverridesSchema.shape,
	operationMode: z.enum(OperationMode),
	management: collectionManagementSchema.nullish(),
})

/** Effective application settings share the existing query and management contracts. */
export const coreCollectionSchema = z.strictObject({
	collection: coreCollectionNameSchema,
	...coreCollectionOverridesSchema.shape,
	management: collectionManagementSchema.optional(),
})

/** Validated collection configuration shared by import and extraction. */
export type SystemCollectionConfig = z.infer<typeof systemCollectionSchema>
