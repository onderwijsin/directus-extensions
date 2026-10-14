import { z } from 'zod'

/** Direct payload keys cannot traverse relationships or write prototype properties. */
export const fieldKeySchema = z
	.string()
	.min(1)
	.refine(
		(key) => !['__proto__', 'prototype', 'constructor'].includes(key) && !/[.[\]]/u.test(key),
		'Use a direct, safe field key',
	)

/** Input and merge policies shared by the polygon transforms. */
export const polygonPayloadOptionsSchema = z.strictObject({
	payload: z.unknown().optional(),
	inputField: fieldKeySchema.default('polygon'),
	outputField: fieldKeySchema,
	overwrite: z.enum(['replace', 'fill-empty', 'preserve-input']).default('replace'),
	missingInput: z.enum(['skip', 'error']).default('skip'),
	nullInput: z.enum(['clear', 'skip', 'error']).default('clear'),
	coordinatePrecision: z.int().min(0).max(15).default(8),
})

/** Polygon calculation bounds from the legacy area hook. */
export const polygonCalculationOptionsSchema = polygonPayloadOptionsSchema.extend({
	maxVertices: z.int().min(3).default(1000),
	maxAreaKm2: z.number().positive().default(100000),
})
