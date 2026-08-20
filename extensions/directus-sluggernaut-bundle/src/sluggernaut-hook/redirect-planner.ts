import type { CollectionConfiguration } from '../shared/types'

import { normalizePermalink } from '../shared/normalization'

export type RedirectSourceType = 'slug' | 'permalink'

export interface RedirectSource {
	type: RedirectSourceType
	field: string
}

export interface RedirectRecord {
	id: string
	origin: string
	destination: string
	type: number
	isActive: boolean
	managedBy?: 'sluggernaut' | null
	sourceCollection?: string | null
	sourceItem?: string | null
	sourceField?: string | null
	sourceType?: RedirectSourceType | null
	inactiveReason?: 'archive' | 'delete' | null
}

export interface RedirectCreation {
	origin: string
	destination: string
	type: 301
	isActive: true
	managedBy: 'sluggernaut'
	sourceCollection: string
	sourceItem: string
	sourceField: string
	sourceType: RedirectSourceType
	inactiveReason: null
}

export interface RedirectPlan {
	create: RedirectCreation | null
	rewrite: { id: string; destination: string }[]
	deactivate: { id: string; inactiveReason: null }[]
	warnings: string[]
}

export interface RedirectLifecyclePlan {
	deactivate: { id: string; inactiveReason: 'archive' | 'delete' }[]
	reactivate: { id: string; isActive: true; inactiveReason: null }[]
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
		return plan
	}

	const managed = input.existingRedirects.filter(
		(redirect) => redirect.managedBy === 'sluggernaut',
	)
	const managedOrigin = managed.find((redirect) => redirect.origin === input.oldCanonical)
	const conflicting = input.existingRedirects.find(
		(redirect) =>
			redirect.origin === input.oldCanonical && redirect.managedBy !== 'sluggernaut',
	)

	if (conflicting) {
		plan.warnings.push(
			`Preserved existing redirect conflict for origin "${input.oldCanonical}".`,
		)
	} else if (managedOrigin === undefined) {
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
	} else {
		plan.rewrite.push({ id: managedOrigin.id, destination: input.newCanonical })
	}

	for (const redirect of managed) {
		if (
			redirect.destination === input.oldCanonical &&
			redirect.origin !== input.newCanonical &&
			redirect.id !== managedOrigin?.id
		) {
			plan.rewrite.push({ id: redirect.id, destination: input.newCanonical })
		}
		if (redirect.origin === input.newCanonical) {
			plan.deactivate.push({ id: redirect.id, inactiveReason: null })
		}
	}

	if (input.oldCanonical === input.newCanonical) {
		plan.create = null
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
