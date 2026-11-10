import type { Filter } from '@directus/types'
import type { SeedItem } from './seedItem'

import { z } from 'zod'

import { bigIntegerKeySchema } from './managementKeys'

/** Complete numeric management boundary; lower bound inclusive, upper bound exclusive. */
const idRangeManagementSchema = z
	.strictObject({ type: z.literal('id-range'), min: z.int().optional(), max: z.int().optional() })
	.refine((range) => range.min !== undefined || range.max !== undefined, {
		error: 'Provide at least one ID bound',
	})
	.refine(
		(range) => range.min === undefined || range.max === undefined || range.min < range.max,
		{ error: 'min must be less than max' },
	)
	.meta({
		anyOf: [{ required: ['min'] }, { required: ['max'] }],
		description:
			'Managed integer IDs: safe-integer min inclusive, max exclusive. Supply at least one bound; min must be less than max when both are set.',
	})

const identifierSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u)
const relationManagementSchema = z.strictObject({
	type: z.literal('relation'),
	field: identifierSchema,
	collection: identifierSchema,
})
const manifestManagementSchema = z.strictObject({ type: z.literal('manifest') })

/** Declarative management boundary, independent of extraction filters and import selection. */
export const collectionManagementSchema = z.discriminatedUnion('type', [
	idRangeManagementSchema,
	relationManagementSchema,
	manifestManagementSchema,
])

/** Consumer-defined collection management. */
export type CollectionManagement = z.infer<typeof collectionManagementSchema>

const primaryKeySchema = z.union([z.string().min(1), z.int()])
const resolvedManagementSchema = z.discriminatedUnion('type', [
	idRangeManagementSchema,
	relationManagementSchema.extend({ ids: z.array(primaryKeySchema) }),
	manifestManagementSchema.extend({ ids: z.array(primaryKeySchema) }),
])

/** Management with snapshotted relation or manifest IDs; never persisted as configuration. */
export type ResolvedCollectionManagement = z.infer<typeof resolvedManagementSchema>

const seedRowSchema = z.looseObject({})
const numericSeedKeySchema = z.union([z.int(), bigIntegerKeySchema])

/**
 * Validates the resolved management boundary and every seed row before any import mutations.
 * @param collectionName - Collection whose boundary is being checked.
 * @param data - All seed rows for the collection.
 * @param management - Optional internal management boundary.
 * @param primaryKey - Resolved primary-key field; defaults to id for existing system callers.
 * @param useSystemMetadata - Whether ordered Operations pass-two metadata is supported.
 * @returns The validated boundary, or undefined for a fully managed collection.
 * @throws Error when the range or a seed ID is invalid or outside the boundary.
 */
export function validateManagedSeedData(
	collectionName: string,
	data: SeedItem[],
	management: unknown,
	primaryKey = 'id',
	useSystemMetadata = true,
): ResolvedCollectionManagement | undefined {
	if (management === undefined) return undefined

	const parsed = resolvedManagementSchema.safeParse(management)
	if (!parsed.success) {
		throw new Error(
			`Invalid management for collection "${collectionName}": ${parsed.error.message}`,
		)
	}

	if (parsed.data.type === 'manifest') {
		const managedIds = new Set(parsed.data.ids)
		for (const [index, item] of data.entries()) {
			const record = seedRowSchema.safeParse(item)
			const id = primaryKeySchema.safeParse(
				record.success ? record.data[primaryKey] : undefined,
			)
			if (!id.success || !managedIds.has(id.data)) {
				throw new Error(
					`Seed record ${index + 1} for collection "${collectionName}" requires an explicit ID inside the managed manifest selection`,
				)
			}
		}
		return parsed.data
	}

	if (parsed.data.type === 'relation') {
		const { field, ids } = parsed.data
		const managedIds = new Set(ids)
		const validatedSeedIds = new Set<string | number>()
		for (const [index, item] of data.entries()) {
			const record = seedRowSchema.safeParse(item)
			const id = primaryKeySchema.safeParse(
				record.success ? record.data[primaryKey] : undefined,
			)
			const value = record.success ? record.data[field] : undefined
			const relation = primaryKeySchema.safeParse(value)
			// Synthesized Operations pass-two updates omit the FK. Only a preceding fully
			// validated row with this ID can authorize such an update; partial rows cannot.
			const updateOnly =
				useSystemMetadata &&
				record.success &&
				id.success &&
				record.data.__isUpdateOnly === true &&
				value === undefined &&
				validatedSeedIds.has(id.data)
			if (
				!id.success ||
				(!updateOnly && (!relation.success || !managedIds.has(relation.data)))
			) {
				throw new Error(
					`Seed record ${index + 1} for collection "${collectionName}" requires an explicit ID and scalar ${field} inside the managed relation selection`,
				)
			}
			if (relation.success && managedIds.has(relation.data)) validatedSeedIds.add(id.data)
		}
		return parsed.data
	}

	const { min, max } = parsed.data
	for (const [index, item] of data.entries()) {
		const record = seedRowSchema.safeParse(item)
		const parsedId = numericSeedKeySchema.safeParse(
			record.success ? record.data[primaryKey] : undefined,
		)
		if (!parsedId.success) {
			throw new Error(
				`Seed record ${index + 1} for collection "${collectionName}" requires a safe integer number or canonical decimal string ID for id-range management`,
			)
		}
		const id = BigInt(parsedId.data)
		if ((min !== undefined && id < BigInt(min)) || (max !== undefined && id >= BigInt(max))) {
			throw new Error(
				`Seed record ${index + 1} for collection "${collectionName}" has ID ${id} outside managed ID range [${min ?? '-infinity'}, ${max ?? 'infinity'})`,
			)
		}
	}

	return parsed.data
}

/**
 * Creates separate Directus predicates so every bound is applied, even on the same ID field.
 * @param range - Validated numeric management interval.
 * @param primaryKey - Resolved primary-key field; defaults to id for existing callers.
 * @returns Predicates to combine with an explicit _and and any separate filter.
 */
export function getIdRangeFilters(
	range: Extract<CollectionManagement, { type: 'id-range' }>,
	primaryKey = 'id',
): Filter[] {
	return [
		...(range.min === undefined ? [] : [{ [primaryKey]: { _gte: range.min } }]),
		...(range.max === undefined ? [] : [{ [primaryKey]: { _lt: range.max } }]),
	]
}

/**
 * Builds the import management boundary. Empty ID selections must be handled as a no-op.
 * @param management - Resolved boundary, including snapshotted relation or manifest IDs.
 * @param primaryKey - Resolved primary-key field; defaults to id for existing callers.
 * @returns Predicates to combine with an explicit _and.
 */
export function getManagementFilters(
	management: ResolvedCollectionManagement,
	primaryKey = 'id',
): Filter[] {
	if (management.type === 'id-range') return getIdRangeFilters(management, primaryKey)
	if (management.ids.length === 0)
		throw new Error(`Empty managed ${management.type} selection must not be queried`)
	const field = management.type === 'manifest' ? primaryKey : management.field
	return [{ [field]: { _in: management.ids } }]
}
