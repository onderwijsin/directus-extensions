import type {
	RedirectCreation,
	RedirectLifecyclePlan,
	RedirectPlan,
	RedirectRecord,
} from './redirect-planner'

export interface RedirectStore {
	readByQuery(query: object): Promise<unknown>
	createOne(data: RedirectCreation): Promise<unknown>
	updateOne(id: string, data: Record<string, unknown>): Promise<unknown>
}

/**
 * Narrows an untrusted Directus service result to a record.
 * @param value - Unknown service result.
 * @returns Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parses the public redirect shape and managed provenance fields.
 * @param value - Unknown Directus redirect record.
 * @returns A parsed redirect or null for incompatible data.
 */
function parseRedirectRecord(value: unknown): RedirectRecord | null {
	if (!isRecord(value)) return null
	const id = value.id
	const origin = value.origin
	const destination = value.destination
	const type = value.type
	const isActive = value.is_active
	if (
		(typeof id !== 'string' && typeof id !== 'number') ||
		typeof origin !== 'string' ||
		typeof destination !== 'string' ||
		typeof type !== 'number' ||
		typeof isActive !== 'boolean'
	) {
		return null
	}

	return {
		id: String(id),
		origin,
		destination,
		type,
		isActive,
		managedBy: value.managed_by === 'sluggernaut' ? 'sluggernaut' : null,
		sourceCollection:
			typeof value.source_collection === 'string' ? value.source_collection : null,
		sourceItem: typeof value.source_item === 'string' ? value.source_item : null,
		sourceField: typeof value.source_field === 'string' ? value.source_field : null,
		sourceType:
			value.source_type === 'slug' || value.source_type === 'permalink'
				? value.source_type
				: null,
		inactiveReason:
			value.inactive_reason === 'archive' || value.inactive_reason === 'delete'
				? value.inactive_reason
				: null,
	}
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
		fields: [
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
		],
		limit: -1,
	})
	if (!Array.isArray(result)) return []
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
		fields: [
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
		],
		limit: -1,
	})
	if (!Array.isArray(result)) return []
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
	if (plan.create !== null) await store.createOne(plan.create)
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
