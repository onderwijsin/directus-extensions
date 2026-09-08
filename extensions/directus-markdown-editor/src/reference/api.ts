import type { ResolvedReferenceCollectionConfig, ReferenceProps } from './schema'

import { itemToReference } from './schema'

export interface ReferenceSearchResult {
	reference: ReferenceProps
	config: ResolvedReferenceCollectionConfig
	rank: number
	apiOrder: number
}

export interface ReferenceApiClient {
	get: (url: string, options?: { signal?: AbortSignal }) => Promise<unknown>
}

/**
 * Extract item objects from a Directus Axios response.
 * @param response Unknown response.
 * @returns Item objects, or an empty array for an invalid response.
 */
function responseItems(response: unknown): Record<string, unknown>[] | undefined {
	if (!response || typeof response !== 'object') return undefined
	const body = Reflect.get(response, 'data')
	if (!body || typeof body !== 'object') return undefined
	const data = Reflect.get(body, 'data')
	if (!Array.isArray(data)) return undefined
	return data.filter(
		(sourceItem): sourceItem is Record<string, unknown> =>
			Boolean(sourceItem) && typeof sourceItem === 'object',
	)
}

/**
 * Read an HTTP status from Axios/Directus errors without depending on their private shape.
 * @param error Unknown request error.
 * @returns Numeric response status when present.
 */
export function referenceErrorStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined
	const response = Reflect.get(error, 'response')
	if (!response || typeof response !== 'object') return undefined
	const status = Reflect.get(response, 'status')
	return typeof status === 'number' ? status : undefined
}

/**
 * Build the exact Directus projection for a Reference request.
 * @param config Resolved collection configuration.
 * @param includeSearch Whether search-only fields are required.
 * @returns Unique requested fields.
 */
function requestedFields(
	config: ResolvedReferenceCollectionConfig,
	includeSearch: boolean,
): string[] {
	return [
		...new Set([
			config.primaryKeyField,
			config.displayField,
			...(includeSearch ? config.searchFields : []),
			...config.dataFields,
		]),
	]
}

/**
 * Build a permission-aware collection search URL.
 * @param config Resolved collection configuration.
 * @param query Search query.
 * @returns Relative Directus items URL.
 */
function searchUrl(config: ResolvedReferenceCollectionConfig, query: string): string {
	const parameters = new URLSearchParams({
		fields: requestedFields(config, true).join(','),
		filter: JSON.stringify({
			_or: config.searchFields.map((field) => ({ [field]: { _icontains: query } })),
		}),
		limit: '5',
	})
	return `/items/${encodeURIComponent(config.collection)}?${parameters.toString()}`
}

/**
 * Rank a display label against a query.
 * @param label Resolved display label.
 * @param query Search query.
 * @returns Match tier.
 */
function matchRank(label: string, query: string) {
	const needle = query.toLocaleLowerCase()
	const normalizedLabel = label.toLocaleLowerCase()
	if (normalizedLabel === needle) return 0
	if (normalizedLabel.startsWith(needle)) return 1
	if (normalizedLabel.includes(needle)) return 2
	return 3
}

/**
 * Search configured collections independently and return five deterministically ranked items.
 * @param api Authenticated Studio API client.
 * @param collections Resolved searchable collections.
 * @param query Author search query.
 * @param signal Optional cancellation signal.
 * @returns Ranked accessible items.
 */
export async function searchReferences(
	api: ReferenceApiClient,
	collections: ResolvedReferenceCollectionConfig[],
	query: string,
	signal?: AbortSignal,
): Promise<ReferenceSearchResult[]> {
	const term = query.trim()
	if (!term) return []
	const searches = collections.map(async (config) => {
		try {
			const response = await api.get(searchUrl(config, term), { signal })
			return (responseItems(response) ?? []).flatMap((sourceItem, apiOrder) => {
				const reference = itemToReference(sourceItem, config)
				return reference
					? [{ reference, config, rank: matchRank(reference.label, term), apiOrder }]
					: []
			})
		} catch (error) {
			if (signal?.aborted || referenceErrorStatus(error) === 403) return []
			return []
		}
	})
	const results = (await Promise.all(searches)).flat()
	return results
		.sort(
			(left, right) =>
				left.rank - right.rank ||
				left.config.order - right.config.order ||
				left.apiOrder - right.apiOrder,
		)
		.slice(0, 5)
}

export interface ReferenceResolution {
	items: Map<string, ReferenceProps>
	unavailableItems: Set<string>
	verificationErrorItems: Set<string>
}

/**
 * Resolve source snapshots in permission-aware batches for one collection.
 * @param api Authenticated Studio API client.
 * @param config Resolved collection configuration.
 * @param items Referenced primary-key values.
 * @param signal Optional cancellation signal.
 * @returns Resolved items and per-item unavailable/error classifications.
 */
export async function resolveReferences(
	api: ReferenceApiClient,
	config: ResolvedReferenceCollectionConfig,
	items: (string | number)[],
	signal?: AbortSignal,
): Promise<ReferenceResolution> {
	const resolvedItems = new Map<string, ReferenceProps>()
	const unavailableItems = new Set<string>()
	const verificationErrorItems = new Set<string>()
	for (let offset = 0; offset < items.length; offset += 100) {
		const chunk = items.slice(offset, offset + 100)
		const parameters = new URLSearchParams({
			fields: requestedFields(config, false).join(','),
			filter: JSON.stringify({ [config.primaryKeyField]: { _in: chunk } }),
			limit: String(chunk.length),
		})
		try {
			const response = await api.get(
				`/items/${encodeURIComponent(config.collection)}?${parameters.toString()}`,
				{ signal },
			)
			const returnedItems = responseItems(response)
			if (!returnedItems) {
				for (const item of chunk) verificationErrorItems.add(String(item))
				continue
			}
			for (const sourceItem of returnedItems) {
				const reference = itemToReference(sourceItem, config)
				if (reference) resolvedItems.set(String(reference.item), reference)
			}
		} catch (error) {
			const status = referenceErrorStatus(error)
			const target =
				status === 403 || status === 404 ? unavailableItems : verificationErrorItems
			for (const item of chunk) target.add(String(item))
		}
	}
	return { items: resolvedItems, unavailableItems, verificationErrorItems }
}
