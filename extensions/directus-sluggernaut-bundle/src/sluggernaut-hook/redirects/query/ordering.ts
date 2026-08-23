import type { Query } from '@directus/types'
import type { RegisterFunctions } from '@onderwijsin/directus-extension-utils/types'
import type { SluggernautEnv } from '../../configuration/env.schema'

import { isArray, isRecord, isString } from '@onderwijsin/directus-extension-utils'

/** Stable default sort used when redirect consumers do not provide an ordering. */
export const DEFAULT_REDIRECT_SORT = ['match', '-specificity', 'id'] as const

/**
 * Narrows the untyped hook boundary to the Directus query shape used by this filter.
 * @param value - Runtime query payload.
 * @returns Whether the value can safely be processed as a query.
 */
function isQuery(value: unknown): value is Query {
	if (!isRecord(value)) return false
	const sort = value.sort
	return (
		sort === undefined ||
		sort === null ||
		(isArray(sort) && sort.every((entry) => isString(entry)))
	)
}

/**
 * Adds the redirect precedence order when no usable caller sort was supplied.
 *
 * Directus represents descending fields with a leading `-`. Since `exact` sorts before `pattern`
 * lexicographically, the first field makes exact redirects win; specificity then orders patterns,
 * and `id` makes otherwise equivalent rows deterministic across pages.
 *
 * @param query - Directus collection query.
 * @returns The original query when it has an explicit sort, otherwise a query with default sorting.
 */
export function applyDefaultRedirectOrdering(query: Query): Query {
	if (query.sort !== undefined && query.sort !== null) {
		if (!isArray(query.sort) || query.sort.length > 0) return query
	}
	return { ...query, sort: [...DEFAULT_REDIRECT_SORT] }
}

/**
 * Registers default ordering for the configured redirect collection.
 * @param hook - Directus hook registration functions.
 * @param options - Validated Sluggernaut options.
 * @returns Nothing.
 */
export function registerRedirectQueryOrdering(
	hook: RegisterFunctions,
	options: SluggernautEnv,
): void {
	if (!options.SLUGGERNAUT_REDIRECTS_ENABLED) return
	hook.filter('items.query', (query: unknown, meta) => {
		if (meta.collection !== options.SLUGGERNAUT_REDIRECTS_COLLECTION) return query
		if (!isQuery(query)) return query
		return applyDefaultRedirectOrdering(query)
	})
}
