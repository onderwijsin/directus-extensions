/**
 * @fileoverview Validates and persists redirect records at the Directus boundary.
 *
 * Adapts the redirect planner's domain model to Directus persistence.
 *
 * Directus stores field names in snake_case and may return numeric primary keys, while the planner
 * uses a stable camelCase model. This module validates and translates at that runtime boundary.
 */
import type {
	RedirectCreation,
	RedirectLifecyclePlan,
	RedirectPlan,
	RedirectRecord,
} from './planner'

import { isArray } from '@onderwijsin/directus-extension-utils'
import { z } from 'zod'

import { redirectRecordSchema } from './planner'

const REDIRECT_FIELDS = [
	'id',
	'origin',
	'destination',
	'type',
	'is_active',
	'managed_by',
	'source_collection',
	'source_item',
	'source_field',
	'source_type',
	'inactive_reason',
] as const

const persistedRedirectRecordSchema = z.looseObject({
	id: z.union([z.string(), z.number()]),
	origin: z.string(),
	destination: z.string(),
	type: z.number(),
	is_active: z.boolean(),
	managed_by: z.literal('sluggernaut').nullable().optional(),
	source_collection: z.string().nullable().optional(),
	source_item: z.string().nullable().optional(),
	source_field: z.string().nullable().optional(),
	source_type: z.enum(['slug', 'permalink']).nullable().optional(),
	inactive_reason: z.enum(['archive', 'delete']).nullable().optional(),
})

const directusRedirectCreationSchema = z.strictObject({
	origin: z.string(),
	destination: z.string(),
	type: z.literal(301),
	is_active: z.literal(true),
	managed_by: z.literal('sluggernaut'),
	source_collection: z.string(),
	source_item: z.string(),
	source_field: z.string(),
	source_type: z.enum(['slug', 'permalink']),
	inactive_reason: z.null(),
})

const redirectUpdateSchema = z.strictObject({
	destination: z.string().optional(),
	is_active: z.boolean().optional(),
	inactive_reason: z.enum(['archive', 'delete']).nullable().optional(),
})

export interface RedirectStore {
	/** Reads records using a Directus query object. */
	readByQuery(query: object): Promise<unknown>
	/** Creates one validated redirect record. */
	createOne(data: DirectusRedirectCreation): Promise<unknown>
	/** Updates one redirect by its normalized string identifier. */
	updateOne(id: string, data: RedirectUpdate): Promise<unknown>
}

/**
 * Redirect creation payload using the persisted Directus field names.
 */
type DirectusRedirectCreation = z.output<typeof directusRedirectCreationSchema>
type RedirectUpdate = z.output<typeof redirectUpdateSchema>

/**
 * Converts the domain redirect model to the persisted Directus field shape.
 * @param redirect - Domain redirect creation model.
 * @returns Directus-compatible redirect creation payload.
 */
function toDirectusRedirectCreation(redirect: RedirectCreation): DirectusRedirectCreation {
	return {
		origin: redirect.origin,
		destination: redirect.destination,
		type: redirect.type,
		is_active: redirect.isActive,
		managed_by: redirect.managedBy,
		source_collection: redirect.sourceCollection,
		source_item: redirect.sourceItem,
		source_field: redirect.sourceField,
		source_type: redirect.sourceType,
		inactive_reason: redirect.inactiveReason,
	}
}

/**
 * Parses the public redirect shape and managed provenance fields.
 * @param value - Unknown Directus redirect record.
 * @returns A parsed redirect or null for incompatible data.
 */
function parseRedirectRecord(value: unknown): RedirectRecord | null {
	const parsed = persistedRedirectRecordSchema.safeParse(value)
	if (!parsed.success) return null
	const record = redirectRecordSchema.safeParse({
		id: String(parsed.data.id),
		origin: parsed.data.origin,
		destination: parsed.data.destination,
		type: parsed.data.type,
		isActive: parsed.data.is_active,
		managedBy: parsed.data.managed_by ?? null,
		sourceCollection: parsed.data.source_collection ?? null,
		sourceItem: parsed.data.source_item ?? null,
		sourceField: parsed.data.source_field ?? null,
		sourceType: parsed.data.source_type ?? null,
		inactiveReason: parsed.data.inactive_reason ?? null,
	})
	return record.success ? record.data : null
}

/**
 * Loads redirects relevant to one canonical transition.
 * @param store - Configured redirect collection store.
 * @param oldCanonical - Previous canonical URL.
 * @param newCanonical - New canonical URL.
 * @returns Parsed redirect records.
 */
export async function readRelevantRedirects(
	store: RedirectStore,
	oldCanonical: string,
	newCanonical: string,
): Promise<RedirectRecord[]> {
	const result = await store.readByQuery({
		filter: {
			_or: [
				{ origin: { _in: [oldCanonical, newCanonical] } },
				{ destination: { _eq: oldCanonical } },
			],
		},
		fields: [...REDIRECT_FIELDS],
		limit: -1,
	})
	if (!isArray(result)) return []
	// Ignore malformed records rather than allowing one bad row to abort item mutation handling.
	return result.flatMap((record) => {
		const parsed = parseRedirectRecord(record)
		return parsed === null ? [] : [parsed]
	})
}

/**
 * Loads managed redirect history owned by one source item.
 * @param store - Configured redirect collection store.
 * @param sourceCollection - Source collection key.
 * @param sourceItem - Source item key.
 * @returns Parsed managed redirect records.
 */
export async function readManagedRedirectsForItem(
	store: RedirectStore,
	sourceCollection: string,
	sourceItem: string,
): Promise<RedirectRecord[]> {
	const result = await store.readByQuery({
		filter: {
			_and: [
				{ managed_by: { _eq: 'sluggernaut' } },
				{ source_collection: { _eq: sourceCollection } },
				{ source_item: { _eq: sourceItem } },
			],
		},
		fields: [...REDIRECT_FIELDS],
		limit: -1,
	})
	if (!isArray(result)) return []
	return result.flatMap((record) => {
		const parsed = parseRedirectRecord(record)
		return parsed?.managedBy === 'sluggernaut' ? [parsed] : []
	})
}

/**
 * Applies a pure redirect plan to a configured store.
 * @param store - Configured redirect collection store.
 * @param plan - Redirect mutations to apply.
 * @returns void
 */
export async function applyRedirectPlan(store: RedirectStore, plan: RedirectPlan): Promise<void> {
	// Apply the plan in a stable order: create/rewrite the active route, then deactivate conflicts.
	if (plan.create !== null) await store.createOne(toDirectusRedirectCreation(plan.create))
	for (const rewrite of plan.rewrite) {
		await store.updateOne(rewrite.id, { destination: rewrite.destination })
	}
	for (const deactivate of plan.deactivate) {
		await store.updateOne(deactivate.id, {
			is_active: false,
			inactive_reason: deactivate.inactiveReason,
		})
	}
}

/**
 * Applies lifecycle changes to managed redirect history.
 * @param store - Configured redirect collection store.
 * @param plan - Lifecycle mutations to apply.
 * @returns void
 */
export async function applyRedirectLifecyclePlan(
	store: RedirectStore,
	plan: RedirectLifecyclePlan,
): Promise<void> {
	for (const redirect of plan.deactivate) {
		await store.updateOne(redirect.id, {
			is_active: false,
			inactive_reason: redirect.inactiveReason,
		})
	}
	for (const redirect of plan.reactivate) {
		await store.updateOne(redirect.id, {
			is_active: true,
			inactive_reason: null,
		})
	}
}
