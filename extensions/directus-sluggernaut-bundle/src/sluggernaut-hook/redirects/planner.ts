/**
 * @fileoverview Plans redirect history without mutating Directus data.
 *
 * Planning is kept separate from persistence so conflict handling and redirect ownership can be
 * tested deterministically. Canonical planning can include redirects from other systems when the
 * selected source field opts into it; lifecycle planning remains limited to Sluggernaut records.
 */
import type { PrimaryKey } from '@directus/types'
import type { CollectionConfiguration } from '../../shared/configuration/types'
import type { InactiveReason, Redirect, RedirectSource, RedirectCreateInput } from './schema'

import { attemptSync, isNonBlankString } from '@onderwijsin/directus-extension-utils'
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
	reactivate: { id: PrimaryKey }[]
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
	deactivate: { id: PrimaryKey; inactive_reason: InactiveReason }[]
	reactivate: { id: PrimaryKey; is_active: true; inactive_reason: null }[]
}

/** Canonical URL transition and provenance used to plan redirect history. */
export interface CanonicalRedirectTransition {
	oldCanonical: string
	newCanonical: string
	source: RedirectSource
	source_collection: string
	source_item: PrimaryKey
}

/**
 * Creates an empty plan for a canonical transition with no redirect changes.
 * @returns An empty redirect plan.
 */
function emptyRedirectPlan(): RedirectPlan {
	return {
		create: null,
		rewrite: [],
		reactivate: [],
		deactivate: [],
		warnings: [],
	}
}

/**
 * Checks whether a managed redirect belongs to the current canonical lifecycle.
 * @param redirect - Redirect provenance to inspect.
 * @param source - Selected canonical source interface.
 * @param collection - Source collection key.
 * @param item - Source item key.
 * @returns Whether all provenance fields identify the current source.
 */
function isOwnedBySource(
	redirect: Redirect,
	source: RedirectSource,
	collection: string,
	item: PrimaryKey,
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
 * Plans the redirect for the previous canonical origin.
 * @param transition - Canonical transition and provenance context.
 * @param managedOrigin - Existing managed redirect for the old canonical origin.
 * @param competingRedirect - Existing redirect that already occupies the old canonical origin.
 * @returns The create, rewrite, or warning decision for the old origin.
 */
function planOldCanonicalOrigin(
	transition: CanonicalRedirectTransition,
	managedOrigin: Redirect | undefined,
	competingRedirect: Redirect | undefined,
): Pick<RedirectPlan, 'create' | 'rewrite' | 'reactivate' | 'warnings'> {
	if (competingRedirect !== undefined) {
		if (
			competingRedirect.managed_by !== 'sluggernaut' &&
			(transition.source.unmanagedRedirectConflictBehavior ?? 'override') === 'block'
		) {
			return {
				create: null,
				rewrite: [],
				reactivate: [],
				warnings: [
					`Preserved existing redirect conflict for origin "${transition.oldCanonical}".`,
				],
			}
		}
		return {
			create: null,
			rewrite: [{ id: competingRedirect.id, destination: transition.newCanonical }],
			reactivate: [],
			warnings: [],
		}
	}

	if (managedOrigin !== undefined) {
		return {
			create: null,
			rewrite: [{ id: managedOrigin.id, destination: transition.newCanonical }],
			reactivate:
				managedOrigin.is_active || managedOrigin.inactive_reason !== null
					? []
					: [{ id: managedOrigin.id }],
			warnings: [],
		}
	}

	return {
		create: createManagedRedirect(transition),
		rewrite: [],
		reactivate: [],
		warnings: [],
	}
}

/**
 * Selects the redirect records visible to canonical planning.
 * @param redirects - Redirect records to inspect.
 * @param transition - Canonical transition and source policy.
 * @returns Redirects included by the source field's planning policy.
 */
function redirectsIncludedInPlanning(
	redirects: readonly Redirect[],
	transition: CanonicalRedirectTransition,
): Redirect[] {
	if (transition.source.includeUnmanagedRedirectsInPlanning ?? true) return [...redirects]
	return redirects.filter((redirect) => redirect.managed_by === 'sluggernaut')
}

/**
 * Finds the managed redirect owned by the current source at the old origin.
 * @param redirects - Managed redirect records to inspect.
 * @param transition - Canonical transition and provenance context.
 * @returns The matching redirect, if one exists.
 */
function managedRedirectAtOldOrigin(
	redirects: readonly Redirect[],
	transition: CanonicalRedirectTransition,
): Redirect | undefined {
	return redirects.find(
		(redirect) =>
			redirect.origin === transition.oldCanonical &&
			isOwnedBySource(
				redirect,
				transition.source,
				transition.source_collection,
				transition.source_item,
			),
	)
}

/**
 * Finds another redirect competing for the old canonical origin.
 * @param redirects - Redirect records to inspect.
 * @param transition - Canonical transition and provenance context.
 * @param managedOrigin - Current source's managed redirect, if present.
 * @returns The competing redirect, if one exists.
 */
function competingRedirectAtOldOrigin(
	redirects: readonly Redirect[],
	transition: CanonicalRedirectTransition,
	managedOrigin: Redirect | undefined,
): Redirect | undefined {
	return redirects.find(
		(redirect) => redirect.origin === transition.oldCanonical && redirect !== managedOrigin,
	)
}

/**
 * Flattens older managed redirect chains to the new canonical destination.
 * @param redirects - Managed redirect records to inspect.
 * @param transition - Canonical transition and provenance context.
 * @param managedOrigin - Current source's managed redirect, if present.
 * @returns Rewrites required to flatten older history.
 */
function planOlderRedirectChains(
	redirects: readonly Redirect[],
	transition: CanonicalRedirectTransition,
	managedOrigin: Redirect | undefined,
): RedirectPlan['rewrite'] {
	return redirects
		.filter(
			(redirect) =>
				redirect.destination === transition.oldCanonical &&
				redirect.origin !== transition.newCanonical &&
				redirect.id !== managedOrigin?.id,
		)
		.map((redirect) => ({ id: redirect.id, destination: transition.newCanonical }))
}

/**
 * Plans deactivation of a managed redirect that would loop back to the new canonical URL.
 * @param redirects - Managed redirect records to inspect.
 * @param transition - Canonical transition and provenance context.
 * @returns Deactivations required to prevent a canonical loop.
 */
function planCanonicalLoopDeactivations(
	redirects: readonly Redirect[],
	transition: CanonicalRedirectTransition,
): RedirectPlan['deactivate'] {
	return redirects
		.filter((redirect) => redirect.origin === transition.newCanonical)
		.map((redirect) => ({ id: redirect.id, inactive_reason: null }))
}

/**
 * Builds a redirect record for a new managed canonical transition.
 * @param transition - Canonical transition and provenance context.
 * @returns A managed redirect creation input.
 */
function createManagedRedirect(transition: CanonicalRedirectTransition): RedirectCreateInput {
	return {
		origin: transition.oldCanonical,
		destination: transition.newCanonical,
		type: 301,
		is_active: true,
		managed_by: 'sluggernaut',
		source_collection: transition.source_collection,
		source_item: transition.source_item,
		source_field: transition.source.field,
		source_type: transition.source.type,
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
	const permalink = configuration.permalinks.find((field) => field.options.automaticRedirects)
	if (permalink !== undefined) {
		return {
			type: 'permalink',
			field: permalink.field,
			includeUnmanagedRedirectsInPlanning:
				permalink.options.includeUnmanagedRedirectsInPlanning,
			unmanagedRedirectConflictBehavior: permalink.options.unmanagedRedirectConflictBehavior,
		}
	}

	const slug = configuration.slugs[0]
	if (slug?.options.automaticRedirects) {
		return {
			type: 'slug',
			field: slug.field,
			includeUnmanagedRedirectsInPlanning: slug.options.includeUnmanagedRedirectsInPlanning,
			unmanagedRedirectConflictBehavior: slug.options.unmanagedRedirectConflictBehavior,
		}
	}
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
	const result = attemptSync(() => normalizePermalink(candidate))
	return result.error === null ? result.data : null
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
	source_item: PrimaryKey
	existingRedirects: readonly Redirect[]
}): RedirectPlan {
	if (
		input.oldCanonical === null ||
		input.newCanonical === null ||
		input.oldCanonical === input.newCanonical
	) {
		// There is no redirect history to change when either endpoint is unavailable or unchanged.
		return emptyRedirectPlan()
	}

	// Normalize the input into one named transition so every planning stage uses the same provenance.
	const transition: CanonicalRedirectTransition = {
		oldCanonical: input.oldCanonical,
		newCanonical: input.newCanonical,
		source: input.source,
		source_collection: input.source_collection,
		source_item: input.source_item,
	}
	// The field setting controls whether manually owned redirects participate in chain flattening,
	// loop prevention, and origin conflict resolution.
	const planningRedirects = redirectsIncludedInPlanning(input.existingRedirects, transition)
	// Resolve ownership at the old origin before deciding whether to create or rewrite its redirect.
	const managedOrigin = managedRedirectAtOldOrigin(planningRedirects, transition)
	// Any other included record at that origin competes for the previous canonical URL.
	const competingRedirect = competingRedirectAtOldOrigin(
		planningRedirects,
		transition,
		managedOrigin,
	)
	// Decide the primary action for the old canonical URL.
	const oldOriginPlan = planOldCanonicalOrigin(transition, managedOrigin, competingRedirect)

	return {
		...emptyRedirectPlan(),
		...oldOriginPlan,
		// Flatten included older URLs so they point directly to the new canonical destination.
		rewrite: [
			...oldOriginPlan.rewrite,
			...planOlderRedirectChains(planningRedirects, transition, managedOrigin),
		],
		reactivate: oldOriginPlan.reactivate,
		// Disable included redirects originating at the new URL to prevent a redirect loop.
		deactivate: planCanonicalLoopDeactivations(planningRedirects, transition),
	}
}

/**
 * Builds a lifecycle update for managed redirects owned by one source item.
 * @param redirects - Existing redirect records.
 * @param inactiveReason - Lifecycle reason.
 * @returns Redirect records to deactivate.
 */
export function planLifecycleDeactivation(
	redirects: readonly Redirect[],
	inactiveReason: InactiveReason,
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
				redirect.managed_by === 'sluggernaut' && redirect.inactive_reason === 'archived',
		)
		.map((redirect) => ({ id: redirect.id, is_active: true, inactive_reason: null }))
}
