/**
 * @fileoverview Plans redirect history without mutating Directus data.
 *
 * Planning is kept separate from persistence so conflict handling and redirect ownership can be
 * tested deterministically. Only redirects carrying Sluggernaut provenance are eligible for
 * rewrite or lifecycle updates; existing redirects owned by another system are preserved.
 */
import type { PrimaryKey } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'
import type { Redirect, RedirectSource, RedirectCreateInput } from './schema'

import { isNonBlankString } from '@onderwijsin/directus-extension-utils'
import { withLeadingSlash } from 'ufo'

import { normalizePermalink } from '../../shared/values/normalization'

/**
 * Pure database mutations required when a source item's canonical URL changes.
 *
 * A redirect plan preserves the item's URL history: it creates or rewrites the redirect from the
 * previous canonical URL to the new one, repairs older managed redirect chains, and deactivates a
 * managed redirect that would otherwise point back to the new canonical URL. It does not represent
 * archive, unarchive, or delete events; those are described by {@link RedirectLifecyclePlan}.
 */
export interface RedirectPlan {
	create: RedirectCreateInput | null
	rewrite: { id: PrimaryKey; destination: string }[]
	deactivate: { id: PrimaryKey; inactive_reason: null }[]
	warnings: string[]
}

/**
 * Pure database mutations required when a source item changes lifecycle state.
 *
 * A lifecycle plan suspends all active Sluggernaut-owned redirect history when the item is archived
 * or deleted, and reactivates history that was suspended specifically by archiving when the item is
 * restored. It does not change redirect origins or destinations after a canonical URL change; those
 * mutations are described by {@link RedirectPlan}.
 */
export interface RedirectLifecyclePlan {
	deactivate: { id: PrimaryKey; inactive_reason: 'archive' | 'delete' }[]
	reactivate: { id: PrimaryKey; is_active: true; inactive_reason: null }[]
}

/**
 * Checks whether a managed redirect belongs to the current canonical lifecycle.
 * @param redirect - Redirect provenance to inspect.
 * @param source - Selected canonical source interface.
 * @param collection - Source collection key.
 * @param item - Source item key.
 * @returns Whether all provenance fields identify the current source.
 */
function belongsToSource(
	redirect: Redirect,
	source: RedirectSource,
	collection: string,
	item: string,
): boolean {
	return (
		redirect.managed_by === 'sluggernaut' &&
		redirect.source_collection === collection &&
		redirect.source_item === item &&
		redirect.source_field === source.field &&
		redirect.source_type === source.type
	)
}

/**
 * Adds the create, rewrite, or conflict result for the current redirect origin.
 * @param plan - Redirect plan being assembled.
 * @param input - Canonical transition and ownership context.
 * @param managedOrigin - Existing managed redirect for the old canonical origin.
 * @param conflicting - Existing redirect that owns the old canonical origin.
 * @returns void.
 */
function planCurrentOrigin(
	plan: RedirectPlan,
	input: {
		oldCanonical: string
		newCanonical: string
		source: RedirectSource
		source_collection: string
		source_item: string
	},
	managedOrigin: Redirect | undefined,
	conflicting: Redirect | undefined,
): void {
	if (conflicting !== undefined) {
		plan.warnings.push(
			`Preserved existing redirect conflict for origin "${input.oldCanonical}".`,
		)
		return
	}

	if (managedOrigin !== undefined) {
		plan.rewrite.push({ id: managedOrigin.id, destination: input.newCanonical })
		return
	}

	plan.create = {
		origin: input.oldCanonical,
		destination: input.newCanonical,
		type: 301,
		is_active: true,
		managed_by: 'sluggernaut',
		source_collection: input.source_collection,
		source_item: input.source_item,
		source_field: input.source.field,
		source_type: input.source.type,
		inactive_reason: null,
	}
}

/**
 * Selects the only interface allowed to generate automatic redirects for a collection.
 * @param configuration - Parsed collection configuration.
 * @returns The first enabled permalink, then the first enabled slug, or null.
 */
export function selectRedirectSource(
	configuration: CollectionConfiguration,
): RedirectSource | null {
	const permalink = configuration.permalinks[0]
	if (permalink?.options.automaticRedirects) {
		return { type: 'permalink', field: permalink.field }
	}

	const slug = configuration.slugs[0]
	if (slug?.options.automaticRedirects) return { type: 'slug', field: slug.field }
	return null
}

/**
 * Resolves a source field into the canonical URL used by redirect history.
 * @param source - Selected redirect source.
 * @param item - Item values.
 * @returns A canonical path or null when the source is empty/invalid.
 */
export function canonicalUrlForItem(
	source: RedirectSource,
	item: Readonly<Record<string, unknown>>,
): string | null {
	const value = item[source.field]
	if (!isNonBlankString(value)) return null
	const candidate = source.type === 'slug' ? withLeadingSlash(value) : value
	try {
		return normalizePermalink(candidate)
	} catch {
		return null
	}
}

/**
 * Plans one canonical redirect transition without mutating Directus data.
 * @param input - Old/new canonical values, ownership context, and existing redirects.
 * @returns A deterministic redirect mutation plan.
 */
export function planCanonicalRedirect(input: {
	oldCanonical: string | null
	newCanonical: string | null
	source: RedirectSource
	source_collection: string
	source_item: string
	existingRedirects: readonly Redirect[]
}): RedirectPlan {
	const plan: RedirectPlan = {
		create: null,
		rewrite: [],
		deactivate: [],
		warnings: [],
	}

	if (
		input.oldCanonical === null ||
		input.newCanonical === null ||
		input.oldCanonical === input.newCanonical
	) {
		// There is no redirect history to change when either endpoint is unavailable or unchanged.
		return plan
	}

	const managed = input.existingRedirects.filter(
		(redirect) => redirect.managed_by === 'sluggernaut',
	)
	const managedOrigin = managed.find(
		(redirect) =>
			redirect.origin === input.oldCanonical &&
			redirect.source_collection === input.source_collection &&
			redirect.source_item === input.source_item &&
			redirect.source_field === input.source.field &&
			redirect.source_type === input.source.type,
	)
	const conflicting = input.existingRedirects.find(
		(redirect) => redirect.origin === input.oldCanonical && redirect !== managedOrigin,
	)

	// First handle the old canonical origin, then repair older managed history below it.
	planCurrentOrigin(
		plan,
		{
			oldCanonical: input.oldCanonical,
			newCanonical: input.newCanonical,
			source: input.source,
			source_collection: input.source_collection,
			source_item: input.source_item,
		},
		managedOrigin,
		conflicting,
	)

	for (const redirect of managed) {
		if (
			belongsToSource(redirect, input.source, input.source_collection, input.source_item) &&
			redirect.destination === input.oldCanonical &&
			redirect.origin !== input.newCanonical &&
			redirect.id !== managedOrigin?.id
		) {
			plan.rewrite.push({ id: redirect.id, destination: input.newCanonical })
		}
		if (
			redirect.origin === input.newCanonical &&
			belongsToSource(redirect, input.source, input.source_collection, input.source_item)
		) {
			plan.deactivate.push({ id: redirect.id, inactive_reason: null })
		}
	}

	return plan
}

/**
 * Builds a lifecycle update for managed redirects owned by one source item.
 * @param redirects - Existing redirect records.
 * @param inactiveReason - Lifecycle reason.
 * @returns Redirect records to deactivate.
 */
export function planLifecycleDeactivation(
	redirects: readonly Redirect[],
	inactiveReason: 'archive' | 'delete',
): RedirectLifecyclePlan['deactivate'] {
	return redirects
		.filter(
			(redirect) =>
				redirect.managed_by === 'sluggernaut' &&
				redirect.is_active &&
				redirect.inactive_reason === null,
		)
		.map((redirect) => ({ id: redirect.id, inactive_reason: inactiveReason }))
}

/**
 * Plans reactivation only for redirects suspended by the matching archive lifecycle.
 * @param redirects - Existing redirect records.
 * @returns IDs eligible for reactivation.
 */
export function planArchiveReactivation(
	redirects: readonly Redirect[],
): RedirectLifecyclePlan['reactivate'] {
	return redirects
		.filter(
			(redirect) =>
				redirect.managed_by === 'sluggernaut' && redirect.inactive_reason === 'archive',
		)
		.map((redirect) => ({ id: redirect.id, is_active: true, inactive_reason: null }))
}
