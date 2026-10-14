import { z } from 'zod'

import { polygonCalculationOptionsSchema } from '../../shared/payload.schema'

/** Payload keys, centroid method and polygon limits. */
export const centroidOptionsSchema = polygonCalculationOptionsSchema
	.extend({
		outputField: polygonCalculationOptionsSchema.shape.outputField.default('centroid'),
		method: z.enum(['projected-area', 'spherical-vertex']).default('projected-area'),
	})
	.refine((options) => options.inputField !== options.outputField, {
		path: ['outputField'],
		message: 'Source and destination fields must differ',
	})
