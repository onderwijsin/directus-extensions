import type { PrimaryKey } from '@directus/types'
import type { RedirectService } from '../service'
/**
 * @fileoverview Validates and applies redirect operations at the Directus boundary.
 *
 * Adapts the redirect planner's domain model to Directus persistence operations.
 *
 * Directus stores field names in snake_case and may return numeric primary keys. This module
 * validates and applies that native Directus shape at the runtime boundary.
 */
import type { RedirectLifecyclePlan, RedirectPlan } from './planner'

import { isArray } from '@onderwijsin/directus-extension-utils'

import { redirectRecordSchema, type Redirect, REDIRECT_FIELDS } from '../schema'

interface RedirectOperationsService {
	readByQuery: (query: Parameters<RedirectService['readByQuery']>[0]) => Promise<unknown>
	createOne: (...args: Parameters<RedirectService['createOne']>) => Promise<unknown>
	updateOne: (...args: Parameters<RedirectService['updateOne']>) => Promise<unknown>
}

/**
 * Parses the public redirect shape and managed provenance fields.
 * @param value - Unknown Directus redirect record.
 * @returns A parsed redirect or null for incompatible data.
 */
function parseRedirectRecord(value: unknown): Redirect | null {
	const parsed = redirectRecordSchema.safeParse(value)
	if (!parsed.success) return null
	return parsed.data
}

/**
 * Loads redirects relevant to one canonical transition.
 * @param service - Configured redirect collection service.
 * @param oldCanonical - Previous canonical URL.
 * @param newCanonical - New canonical URL.
 * @returns Parsed redirect records.
 */
export async function readRelevantRedirects(
	service: RedirectOperationsService,
	oldCanonical: string,
	newCanonical: string,
): Promise<Redirect[]> {
	const result = await service.readByQuery({
		filter: {
			_and: [
				{ match: { _eq: 'exact' } },
				{
					_or: [
						{ origin: { _in: [oldCanonical, newCanonical] } },
						{ destination: { _eq: oldCanonical } },
					],
				},
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
 * @param service - Configured redirect collection service.
 * @param sourceCollection - Source collection key.
 * @param sourceItem - Source item key.
 * @returns Parsed managed redirect records.
 */
export async function readManagedRedirectsForItem(
	service: RedirectOperationsService,
	sourceCollection: string,
	sourceItem: PrimaryKey,
): Promise<Redirect[]> {
	const result = await service.readByQuery({
		filter: {
			_and: [
				{ match: { _eq: 'exact' } },
				{ managed_by: { _eq: 'sluggernaut' } },
				{ source_collection: { _eq: sourceCollection } },
				// Directus may deliver numeric primary keys in delete events, while the provenance
				// field is persisted as text. Normalize the boundary value so both representations match.
				{ source_item: { _eq: String(sourceItem) } },
			],
		},
		fields: [...REDIRECT_FIELDS],
		limit: -1,
	})
	if (!isArray(result)) return []
	return result.flatMap((record) => {
		const parsed = parseRedirectRecord(record)
		return parsed?.managed_by === 'sluggernaut' ? [parsed] : []
	})
}

/**
 * Applies canonical-URL redirect mutations to a configured service.
 *
 * Use this for a source item whose canonical value changed. The operation creates or rewrites
 * redirect history from the old canonical URL to the new one, then deactivates any planned managed
 * redirect that conflicts with the new canonical URL. For archive, unarchive, or delete transitions,
 * use {@link applyRedirectLifecyclePlan} instead.
 * @param service - Configured redirect collection service.
 * @param plan - Mutations planned for one canonical URL transition.
 * @returns void
 */
export async function applyRedirectPlan(
	service: RedirectOperationsService,
	plan: RedirectPlan,
): Promise<void> {
	// Apply the plan in a stable order: create/rewrite/reactivate the active route, then deactivate conflicts.
	if (plan.create !== null) await service.createOne(plan.create)
	for (const rewrite of plan.rewrite) {
		await service.updateOne(rewrite.id, { destination: rewrite.destination })
	}
	for (const reactivate of plan.reactivate) {
		await service.updateOne(reactivate.id, { is_active: true, inactive_reason: null })
	}
	for (const deactivate of plan.deactivate) {
		await service.updateOne(deactivate.id, {
			is_active: false,
			inactive_reason: deactivate.inactive_reason,
		})
	}
}

/**
 * Applies source-item lifecycle mutations to managed redirect history.
 *
 * Use this when the source item is archived, restored, or deleted. Archive and delete deactivate
 * existing active Sluggernaut-owned history with the corresponding reason; restoration reactivates
 * only history previously deactivated for archiving. This operation does not create or rewrite
 * redirects when a canonical value changes; use {@link applyRedirectPlan} for that transition.
 * @param service - Configured redirect collection service.
 * @param plan - Deactivations and reactivations planned for one lifecycle transition.
 * @returns void
 */
export async function applyRedirectLifecyclePlan(
	service: RedirectOperationsService,
	plan: RedirectLifecyclePlan,
): Promise<void> {
	for (const redirect of plan.deactivate) {
		await service.updateOne(redirect.id, {
			is_active: false,
			inactive_reason: redirect.inactive_reason,
		})
	}
	for (const redirect of plan.reactivate) {
		await service.updateOne(redirect.id, {
			is_active: true,
			inactive_reason: null,
		})
	}
}
