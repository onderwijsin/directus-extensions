/**
 * @fileoverview Plans redirect history without mutating Directus data.
 *
 * Plans redirect-history changes without performing database writes.
 *
 * Planning is kept separate from persistence so conflict handling and redirect ownership can be
 * tested deterministically. Only redirects carrying Sluggernaut provenance are eligible for
 * rewrite or lifecycle updates; existing redirects owned by another system are preserved.
 */
import type { CollectionConfiguration } from '../../shared/configuration/types'

import { z } from 'zod'

import { normalizePermalink } from '../../shared/values/normalization'

/** Supported field types for canonical redirect sources. */
export type RedirectSourceType = 'slug' | 'permalink'

/** Identifies the configured field that supplies a canonical redirect URL. */
export interface RedirectSource {
	type: RedirectSourceType
	field: string
}

/** Runtime schema for the planner's normalized redirect record. */
export const redirectRecordSchema = z.strictObject({
	id: z.string(),
	origin: z.string(),
	destination: z.string(),
	type: z.number(),
	isActive: z.boolean(),
	managedBy: z.literal('sluggernaut').nullable().optional(),
	sourceCollection: z.string().nullable().optional(),
	sourceItem: z.string().nullable().optional(),
	sourceField: z.string().nullable().optional(),
	sourceType: z.enum(['slug', 'permalink']).nullable().optional(),
	inactiveReason: z.enum(['archive', 'delete']).nullable().optional(),
})

/** Normalized redirect record used by the planner. */
export type RedirectRecord = z.output<typeof redirectRecordSchema>

/** Runtime schema for a new managed redirect. */
export const redirectCreationSchema = z.strictObject({
	origin: z.string(),
	destination: z.string(),
	type: z.literal(301),
	isActive: z.literal(true),
	managedBy: z.literal('sluggernaut'),
	sourceCollection: z.string(),
	sourceItem: z.string(),
	sourceField: z.string(),
	sourceType: z.enum(['slug', 'permalink']),
	inactiveReason: z.null(),
})

export type RedirectCreation = z.output<typeof redirectCreationSchema>

/** Pure database mutations required for one canonical URL transition. */
export interface RedirectPlan {
	create: RedirectCreation | null
	rewrite: { id: string; destination: string }[]
	deactivate: { id: string; inactiveReason: null }[]
	warnings: string[]
}

/** Lifecycle changes applied when a source item is archived, restored, or deleted. */
export interface RedirectLifecyclePlan {
	deactivate: { id: string; inactiveReason: 'archive' | 'delete' }[]
	reactivate: { id: string; isActive: true; inactiveReason: null }[]
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
	redirect: RedirectRecord,
	source: RedirectSource,
	collection: string,
	item: string,
): boolean {
	return (
		redirect.managedBy === 'sluggernaut' &&
		redirect.sourceCollection === collection &&
		redirect.sourceItem === item &&
		redirect.sourceField === source.field &&
		redirect.sourceType === source.type
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
		sourceCollection: string
		sourceItem: string
	},
	managedOrigin: RedirectRecord | undefined,
	conflicting: RedirectRecord | undefined,
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
		isActive: true,
		managedBy: 'sluggernaut',
		sourceCollection: input.sourceCollection,
		sourceItem: input.sourceItem,
		sourceField: input.source.field,
		sourceType: input.source.type,
		inactiveReason: null,
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
	if (typeof value !== 'string' || value.trim() === '') return null
	const candidate = source.type === 'slug' ? `/${value}` : value
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
	sourceCollection: string
	sourceItem: string
	existingRedirects: readonly RedirectRecord[]
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
		(redirect) => redirect.managedBy === 'sluggernaut',
	)
	const managedOrigin = managed.find(
		(redirect) =>
			redirect.origin === input.oldCanonical &&
			redirect.sourceCollection === input.sourceCollection &&
			redirect.sourceItem === input.sourceItem &&
			redirect.sourceField === input.source.field &&
			redirect.sourceType === input.source.type,
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
			sourceCollection: input.sourceCollection,
			sourceItem: input.sourceItem,
		},
		managedOrigin,
		conflicting,
	)

	for (const redirect of managed) {
		if (
			belongsToSource(redirect, input.source, input.sourceCollection, input.sourceItem) &&
			redirect.destination === input.oldCanonical &&
			redirect.origin !== input.newCanonical &&
			redirect.id !== managedOrigin?.id
		) {
			plan.rewrite.push({ id: redirect.id, destination: input.newCanonical })
		}
		if (
			redirect.origin === input.newCanonical &&
			belongsToSource(redirect, input.source, input.sourceCollection, input.sourceItem)
		) {
			plan.deactivate.push({ id: redirect.id, inactiveReason: null })
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
	redirects: readonly RedirectRecord[],
	inactiveReason: 'archive' | 'delete',
): RedirectLifecyclePlan['deactivate'] {
	return redirects
		.filter(
			(redirect) =>
				redirect.managedBy === 'sluggernaut' &&
				redirect.isActive &&
				redirect.inactiveReason === null,
		)
		.map((redirect) => ({ id: redirect.id, inactiveReason }))
}

/**
 * Plans reactivation only for redirects suspended by the matching archive lifecycle.
 * @param redirects - Existing redirect records.
 * @returns IDs eligible for reactivation.
 */
export function planArchiveReactivation(
	redirects: readonly RedirectRecord[],
): RedirectLifecyclePlan['reactivate'] {
	return redirects
		.filter(
			(redirect) =>
				redirect.managedBy === 'sluggernaut' && redirect.inactiveReason === 'archive',
		)
		.map((redirect) => ({ id: redirect.id, isActive: true, inactiveReason: null }))
}
