import { z } from 'zod'

/** Snapshot files keep Directus-owned metadata intact while validating the file envelope. */
export const metadataSchema = z.looseObject({
	version: z.number().int().positive(),
	directus: z.string().min(1),
	vendor: z
		.enum(['mysql', 'postgres', 'cockroachdb', 'sqlite', 'oracle', 'mssql', 'redshift'])
		.optional(),
})

/** Collections include virtual folder groups with a null schema. */
export const collectionSchema = z.looseObject({
	collection: z.string().min(1),
	meta: z.record(z.string(), z.unknown()).nullable(),
	schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

/** Native persisted fields omit Studio-only properties such as the display name. */
export const fieldSchema = z.looseObject({
	collection: z.string().min(1),
	field: z.string().min(1),
	type: z.string().min(1).nullable(),
	meta: z.record(z.string(), z.unknown()).nullable(),
	schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

/** Relations preserve Directus-owned schema and metadata. */
export const relationSchema = z.looseObject({
	collection: z.string().min(1),
	field: z.string().min(1),
	related_collection: z.string().nullable(),
	meta: z.record(z.string(), z.unknown()).nullable(),
	schema: z.record(z.string(), z.unknown()).nullable().optional(),
})

/** System-field indexes preserve additional Directus-owned properties. */
export const systemFieldSchema = z.looseObject({
	collection: z.string().min(1),
	field: z.string().min(1),
	schema: z.looseObject({ is_indexed: z.boolean() }),
})

/** Parses a complete native snapshot before migration into split files. */
export const snapshotSchema = z.looseObject({
	...metadataSchema.shape,
	collections: z.array(collectionSchema),
	fields: z.array(fieldSchema),
	relations: z.array(relationSchema),
	systemFields: z.array(systemFieldSchema).default([]),
})

/** Persisted Directus snapshot, without imposing Studio-only field properties. */
export type PersistedSnapshot = z.infer<typeof snapshotSchema>
