import type { InterfaceOptions } from './types'

import { isArray } from '@onderwijsin/directus-extension-utils'
import { ofetch } from 'ofetch'

import { normalizeFeature } from './normalize'
import { mapboxResponseSchema } from './response.schema'

/** Searches Mapbox and returns normalized candidates and their attribution.
 * @param text - Address search text.
 * @param options - Validated interface options.
 * @param token - Public Mapbox token.
 * @returns Normalized addresses and provider attribution.
 */
export async function searchAddresses(text: string, options: InterfaceOptions, token: string) {
	const response = await ofetch<unknown>('https://api.mapbox.com/search/geocode/v6/forward', {
		query: {
			q: text,
			access_token: token,
			permanent: options.permanent,
			autocomplete: options.autocomplete,
			language: options.language,
			country: options.countries.length ? options.countries.join(',') : undefined,
			types: options.featureTypes.join(','),
			limit: options.resultLimit,
			worldview: options.worldview,
			proximity: isArray(options.proximity)
				? options.proximity.join(',')
				: (options.proximity ?? undefined),
		},
	})
	const { features, attribution } = mapboxResponseSchema.parse(response)
	return { results: features.map((feature) => normalizeFeature(feature, options)), attribution }
}
