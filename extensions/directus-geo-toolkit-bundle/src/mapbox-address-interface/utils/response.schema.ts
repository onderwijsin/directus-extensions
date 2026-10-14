import { z } from 'zod'

import { positionSchema, addressFeatureTypeSchema } from '../../shared/address.schema'

/** Validate the provider fields used by the adapter, allowing additive v6 properties. */
export const mapboxFeatureSchema = z.object({
	type: z.literal('Feature'),
	geometry: z.object({ type: z.literal('Point'), coordinates: positionSchema }),
	properties: z.looseObject({
		mapbox_id: z.string().min(1),
		feature_type: addressFeatureTypeSchema,
		full_address: z.string().optional(),
		name: z.string().optional(),
		name_preferred: z.string().optional(),
		place_formatted: z.string().optional(),
		context: z.record(z.string(), z.unknown()).default({}),
	}),
})

/** Attribution belongs to the transient results UI, not the stored address. */
export const mapboxResponseSchema = z.object({
	type: z.literal('FeatureCollection'),
	features: z.array(mapboxFeatureSchema),
	attribution: z.string().default(''),
})
