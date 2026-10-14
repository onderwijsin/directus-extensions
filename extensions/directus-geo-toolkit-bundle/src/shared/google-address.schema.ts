import { z } from 'zod'

import { geoJsonPointSchema } from './geometry.schema'

/** Saved GeoJSON Feature from the Directus Labs Google address interface. */
export const googleAddressSchema = z.object({
	type: z.literal('Feature'),
	geometry: geoJsonPointSchema,
	properties: z.object({
		formated: z.string(),
		country: z
			.string()
			.regex(/^[A-Za-z]{2}$/u)
			.optional(),
		postalCode: z.string().optional(),
		administrativeArea: z.string().optional(),
		raw: z.array(
			z.object({ longText: z.string(), shortText: z.string(), types: z.array(z.string()) }),
		),
	}),
})
