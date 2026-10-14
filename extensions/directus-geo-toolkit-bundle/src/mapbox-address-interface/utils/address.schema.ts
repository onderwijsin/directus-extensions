import { z } from 'zod'

import { addressValueSchema } from '../../shared/address.schema'

/** Mapbox provenance extends the common address contract without changing saved values. */
export const mapboxAddressValueSchema = addressValueSchema.extend({
	provider: z.literal('mapbox'),
	providerApi: z.literal('geocoding-v6'),
	mapboxId: z.string().min(1),
})
