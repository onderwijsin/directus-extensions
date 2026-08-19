import type { RawCollection, RawField, Relation } from '@directus/types'
import type { DirectusSchemaDefinition } from '../operations/core'

import { z } from 'zod'

import { isNonBlankString, isRecord, isString } from '../../../shared'

const rawFieldSchema: z.ZodType<RawField> = z.looseObject({
	field: z.string(),
	type: z.custom<RawField['type']>(isString),
	collection: z.string().optional(),
	schema: z.custom<RawField['schema']>(isRecord).nullable().optional(),
	meta: z.custom<RawField['meta']>(isRecord).nullable().optional(),
})
const rawCollectionSchema: z.ZodType<RawCollection> = z.looseObject({
	collection: z.string(),
	fields: z.array(rawFieldSchema).optional(),
	schema: z.custom<RawCollection['schema']>(isRecord).nullable().optional(),
	meta: z.custom<RawCollection['meta']>(isRecord).nullable().optional(),
})
const relationSchema: z.ZodType<Partial<Relation>> = z.looseObject({
	collection: z.string().optional(),
	field: z.string().optional(),
	related_collection: z.string().nullable().optional(),
	schema: z.custom<Relation['schema']>(isRecord).nullable().optional(),
	meta: z.custom<Relation['meta']>(isRecord).nullable().optional(),
})

/** Validates portable Directus collections, fields, and relations. */
const directusSchemaDefinitionSchema: z.ZodType<DirectusSchemaDefinition> = z.object({
	collections: z.array(rawCollectionSchema),
	fields: z.array(rawFieldSchema),
	relations: z.array(relationSchema),
})

/**
 * Validates an extension-owned Directus schema definition.
 * @param input - Bundled JSON or another unknown schema definition.
 * @returns A typed Directus schema definition.
 */
export function validateSchemaDefinition(input: unknown): DirectusSchemaDefinition {
	return directusSchemaDefinitionSchema.parse(input)
}

/**
 * Replaces the configured collection identity in a portable schema definition.
 * @param name - Collection name to use in the returned definition.
 * @param schema - Portable schema definition containing one source collection.
 * @returns A schema definition with all references to the source collection replaced.
 */
export function withCollectionIdentity(
	name: string,
	schema: DirectusSchemaDefinition,
): DirectusSchemaDefinition {
	if (!isNonBlankString(name)) throw new Error('Collection name must be non-blank')

	const sourceName = schema.collections[0]?.collection
	if (!isString(sourceName) || !isNonBlankString(sourceName)) {
		throw new Error('Schema definition must contain a collection name')
	}

	/**
	 * @param value - Collection reference.
	 * @returns Replaced reference or the original value.
	 */
	const replace = (value: string | null | undefined): string | null | undefined =>
		value === sourceName ? name : value
	/**
	 * @param value - Optional collection reference.
	 * @returns Replaced reference or the original value.
	 */
	const replaceString = (value: string | undefined): string | undefined =>
		value === sourceName ? name : value
	/**
	 * @param value - Required collection reference.
	 * @returns Replaced reference or the original value.
	 */
	const replaceRequired = (value: string): string => (value === sourceName ? name : value)
	/**
	 * @param value - Nullable collection reference.
	 * @returns Replaced reference or the original value.
	 */
	const replaceNullable = (value: string | null): string | null =>
		value === sourceName ? name : value
	/**
	 * @param value - Optional nullable collection reference.
	 * @returns Replaced reference or the original value.
	 */
	const replaceNullableOptional = (
		value: string | null | undefined,
	): string | null | undefined => (value === sourceName ? name : value)

	return {
		...schema,
		collections: schema.collections.map((collection) => ({
			...collection,
			collection: replace(collection.collection) ?? collection.collection,
			schema:
				collection.schema?.name === sourceName
					? { ...collection.schema, name }
					: collection.schema,
			fields: collection.fields?.map((field) => ({
				...field,
				collection: replace(field.collection) ?? field.collection,
			})),
		})),
		fields: schema.fields.map((field) => ({
			...field,
			collection: replace(field.collection) ?? field.collection,
		})),
		relations: schema.relations.map((relation) => ({
			...relation,
			collection: replaceString(relation.collection),
			related_collection: replaceNullableOptional(relation.related_collection),
			meta: relation.meta
				? {
						...relation.meta,
						many_collection: replaceRequired(relation.meta.many_collection),
						one_collection: replaceNullable(relation.meta.one_collection),
					}
				: relation.meta,
		})),
	}
}
