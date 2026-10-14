import { z } from 'zod'

import { polygonCalculationOptionsSchema } from '../../shared/payload.schema'

/** Payload options and target density for the adaptive polygon grid. */
export const gridOptionsSchema = polygonCalculationOptionsSchema
	.extend({
		outputField: polygonCalculationOptionsSchema.shape.outputField.default('grid_points'),
		spacing: z.number().positive().default(8),
		units: z.enum(['meters', 'kilometers']).default('kilometers'),
		minPoints: z.int().nonnegative().default(0),
		maxPoints: z.int().positive().default(500),
		maxCandidates: z.int().positive().default(10000),
		minimumBoundaryDistance: z.number().nonnegative().default(0),
		minimumVertexDistance: z.number().nonnegative().default(0),
		emptyResult: z.enum(['null', 'empty-multipoint', 'error']).default('null'),
	})
	.superRefine((options, context) => {
		if (options.inputField === options.outputField)
			context.addIssue({
				code: 'custom',
				path: ['outputField'],
				message: 'Source and destination fields must differ',
			})
		if (options.minPoints > options.maxPoints)
			context.addIssue({
				code: 'custom',
				path: ['minPoints'],
				message: 'minPoints must not exceed maxPoints',
			})
		if (options.maxPoints > options.maxCandidates)
			context.addIssue({
				code: 'custom',
				path: ['maxCandidates'],
				message: 'maxCandidates must be at least maxPoints',
			})
	})
