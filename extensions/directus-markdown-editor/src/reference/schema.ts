import {
	hasKey,
	isBoolean,
	isNumber,
	isRecord,
	isString,
	toEntries,
	fromEntries,
	isArray,
} from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

const identifierSchema = z
	.string()
	.min(1)
	.regex(/^[\w-]+$/u, 'Only direct field names are supported.')

/**
 * Validate recursively that a value can be persisted in the MDC JSON binding.
 * @param value Candidate value.
 * @returns Whether the value is JSON-compatible.
 */
function isJsonValue(value: unknown): boolean {
	if (value === null) return true
	if (isString(value) || isBoolean(value)) return true
	if (isNumber(value)) return Number.isFinite(value)
	if (isArray(value)) return value.every(isJsonValue)
	if (!isRecord(value)) return false
	return toEntries(value).every(([, entry]) => isJsonValue(entry))
}

export const ReferencePropsSchema = z.looseObject({
	collection: z.string().min(1),
	item: z.union([z.string(), z.number().finite()]),
	label: z.string(),
	text: z.string().optional(),
	icon: z.string().optional(),
	data: z
		.record(z.string(), z.unknown())
		.refine(isJsonValue, 'Reference data must be JSON-compatible.'),
})

export type ReferenceProps = z.infer<typeof ReferencePropsSchema>

const ReferenceCollectionConfigSchema = z.object({
	collection: identifierSchema,
	displayField: identifierSchema,
	searchFields: z.array(identifierSchema).optional(),
	dataFields: z.array(identifierSchema).optional(),
})

export type ReferenceCollectionConfig = z.infer<typeof ReferenceCollectionConfigSchema>
export type ReferenceSnapshotMode = 'snapshot' | 'detect' | 'sync'

export interface ReferenceArchiveConfig {
	field: string
	value: string
	fieldType: string
}

export interface ResolvedReferenceCollectionConfig {
	collection: string
	displayField: string
	searchFields: string[]
	dataFields: string[]
	primaryKeyField: string
	order: number
	archive?: ReferenceArchiveConfig
}

export interface ReferenceConfiguration {
	collections: ResolvedReferenceCollectionConfig[]
	errors: string[]
}

interface FieldDescription {
	field: string
	type: string
	isPrimaryKey: boolean
	isRelational: boolean
}

/**
 * De-duplicate strings without changing the configured precedence.
 * @param values Ordered values.
 * @returns Unique ordered values.
 */
function unique(values: string[]): string[] {
	return [...new Set(values)]
}

/**
 * Normalize the Directus field metadata needed by Reference configuration.
 * @param value Unknown field-store entry.
 * @returns Relevant field metadata when structurally valid.
 */
function readField(value: unknown): FieldDescription | undefined {
	if (!isRecord(value)) return undefined
	const field = Reflect.get(value, 'field')
	const type = Reflect.get(value, 'type')
	const schema = Reflect.get(value, 'schema')
	const meta = Reflect.get(value, 'meta')
	if (!isString(field) || !isString(type)) return undefined
	const primaryKey = isRecord(schema) ? Reflect.get(schema, 'is_primary_key') : false
	const foreignTable = isRecord(schema) ? Reflect.get(schema, 'foreign_key_table') : undefined
	const special = isRecord(meta) ? Reflect.get(meta, 'special') : undefined
	const relationSpecials = new Set(['m2o', 'o2m', 'm2m', 'm2a', 'translations', 'file', 'files'])
	const hasRelationSpecial =
		isArray(special) && special.some((entry) => relationSpecials.has(String(entry)))
	return {
		field,
		type,
		isPrimaryKey: primaryKey === true,
		isRelational: type === 'alias' || isString(foreignTable) || hasRelationSpecial,
	}
}

/**
 * Validate configured Reference collections against Directus field metadata.
 * @param input Raw interface configuration.
 * @param getFields Returns the fields currently known to Directus for a collection.
 * @param getCollection Returns collection metadata currently known to Directus.
 * @returns Usable collections and non-fatal configuration errors.
 */
export function resolveReferenceCollections(
	input: unknown,
	getFields: (collection: string) => unknown,
	getCollection: (collection: string) => unknown = () => undefined,
): ReferenceConfiguration {
	const list = z.array(ReferenceCollectionConfigSchema).min(1).safeParse(input)
	if (!list.success) {
		return {
			collections: [],
			errors: ['Reference collections must be a non-empty valid JSON array.'],
		}
	}

	const collections: ResolvedReferenceCollectionConfig[] = []
	const errors: string[] = []
	const collectionCounts = new Map<string, number>()
	for (const config of list.data) {
		collectionCounts.set(config.collection, (collectionCounts.get(config.collection) ?? 0) + 1)
	}
	for (const [order, config] of list.data.entries()) {
		if ((collectionCounts.get(config.collection) ?? 0) > 1) {
			if (!errors.some((error) => error.includes(`“${config.collection}”`))) {
				errors.push(`Collection “${config.collection}” is configured more than once.`)
			}
			continue
		}
		let rawFields: unknown
		try {
			rawFields = getFields(config.collection)
		} catch {
			errors.push(`Collection “${config.collection}” metadata could not be resolved.`)
			continue
		}
		const fields = isArray(rawFields)
			? rawFields.map(readField).filter((field) => field !== undefined)
			: []
		const byName = new Map(fields.map((field) => [field.field, field]))
		const primaryKey = fields.find((field) => field.isPrimaryKey)
		const searchFields = unique(config.searchFields ?? [config.displayField])
		const dataFields = unique(config.dataFields ?? [])
		const configuredFields = unique([config.displayField, ...searchFields, ...dataFields])
		const missing = configuredFields.filter((field) => !byName.has(field))
		const relational = configuredFields.filter((field) => byName.get(field)?.isRelational)
		const unsupportedSearch = searchFields.filter((field) => {
			const type = byName.get(field)?.type
			return type !== 'string' && type !== 'text'
		})
		let archive: ReferenceArchiveConfig | undefined
		let rawCollection: unknown
		try {
			rawCollection = getCollection(config.collection)
		} catch {
			rawCollection = undefined
		}
		const collectionMeta = isRecord(rawCollection)
			? Reflect.get(rawCollection, 'meta')
			: undefined
		const archiveField = isRecord(collectionMeta)
			? Reflect.get(collectionMeta, 'archive_field')
			: undefined
		const archiveValue = isRecord(collectionMeta)
			? Reflect.get(collectionMeta, 'archive_value')
			: undefined
		if (isString(archiveField) && isString(archiveValue)) {
			const field = byName.get(archiveField)
			if (field) archive = { field: archiveField, value: archiveValue, fieldType: field.type }
			else {
				errors.push(
					`Collection “${config.collection}” has an archive field that could not be resolved: ${archiveField}.`,
				)
			}
		}
		if (!primaryKey)
			errors.push(`Collection “${config.collection}” has no resolvable primary key.`)
		if (missing.length)
			errors.push(
				`Collection “${config.collection}” has unknown fields: ${missing.join(', ')}.`,
			)
		if (relational.length)
			errors.push(
				`Collection “${config.collection}” uses unsupported relational fields: ${relational.join(', ')}.`,
			)
		if (unsupportedSearch.length)
			errors.push(
				`Collection “${config.collection}” has non-text search fields: ${unsupportedSearch.join(', ')}.`,
			)
		if (!primaryKey || missing.length || relational.length || unsupportedSearch.length) continue
		collections.push({
			...config,
			searchFields,
			dataFields,
			primaryKeyField: primaryKey.field,
			order,
			...(archive ? { archive } : {}),
		})
	}
	return { collections, errors }
}

/**
 * Compare an item value with Directus's string-backed configured archive value.
 * @param value Item value returned by Directus.
 * @param archive Resolved archive metadata and field type.
 * @returns Whether the source item is archived.
 */
export function isReferenceItemArchived(value: unknown, archive: ReferenceArchiveConfig): boolean {
	if (archive.fieldType === 'boolean') {
		if (archive.value === 'true') return value === true
		if (archive.value === 'false') return value === false
	}
	if (['integer', 'bigInteger', 'float', 'decimal'].includes(archive.fieldType)) {
		const configured = Number(archive.value)
		return Number.isFinite(configured) && value === configured
	}
	return value === archive.value
}

/**
 * Normalize a display-field value to the persisted label.
 * @param value Directus display-field value.
 * @param item Source primary-key value used as a fallback.
 * @returns Display label.
 */
function displayLabel(value: unknown, item: string | number): string {
	if (value == null || value === '') return String(item)
	if (isString(value)) return value
	if (isNumber(value) || isBoolean(value) || typeof value === 'bigint') {
		return String(value)
	}
	return JSON.stringify(value) ?? String(item)
}

/**
 * Build the persisted, source-owned snapshot from one permission-filtered Directus item.
 * @param sourceItem Directus item returned with the configured projection.
 * @param config Resolved collection configuration.
 * @returns A canonical Reference snapshot, or undefined for an invalid primary key.
 */
export function itemToReference(
	sourceItem: Record<string, unknown>,
	config: ResolvedReferenceCollectionConfig,
): ReferenceProps | undefined {
	const item = sourceItem[config.primaryKeyField]
	if (!isString(item) && !isNumber(item)) return undefined
	if (![config.displayField, ...config.dataFields].every((field) => hasKey(sourceItem, field))) {
		return undefined
	}
	const rawLabel = sourceItem[config.displayField]
	const label = displayLabel(rawLabel, item)
	const data: Record<string, unknown> = {}
	for (const field of config.dataFields) data[field] = sourceItem[field]
	const parsed = ReferencePropsSchema.safeParse({
		collection: config.collection,
		item,
		label,
		data,
	})
	return parsed.success ? parsed.data : undefined
}

/**
 * Parse persisted Reference props without changing malformed external Markdown.
 * @param value Raw MDC properties.
 * @returns Zod parsing result.
 */
export function parseReferenceProps(value: unknown) {
	return ReferencePropsSchema.safeParse(value)
}

/**
 * Sort object keys recursively for stable JSON comparison.
 * @param value JSON-compatible value.
 * @returns Structurally equivalent value with sorted object keys.
 */
function stableValue(value: unknown): unknown {
	if (isArray(value)) return value.map(stableValue)
	if (!isRecord(value)) return value
	return fromEntries(
		toEntries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, stableValue(entry)]),
	)
}

/**
 * Compare only the source-owned portion of two reference snapshots.
 * @param stored Persisted reference.
 * @param current Current source snapshot.
 * @returns Whether label and data are structurally equal.
 */
export function isReferenceSnapshotCurrent(
	stored: ReferenceProps,
	current: ReferenceProps,
): boolean {
	return (
		JSON.stringify(stableValue({ label: stored.label, data: stored.data })) ===
		JSON.stringify(stableValue({ label: current.label, data: current.data }))
	)
}
