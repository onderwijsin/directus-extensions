import { z } from 'zod'

/** Ordered transformations applied to a scalar template variable. */
export const pathTransformSchema = z.discriminatedUnion('type', [
	z.strictObject({ type: z.literal('map'), values: z.record(z.string(), z.string()) }),
	z.strictObject({ type: z.literal('slugify') }),
	z.strictObject({ type: z.literal('lowercase') }),
])

/** Configuration for one placeholder, optionally resolving a differently named field. */
export const pathTemplateVariableSchema = z.strictObject({
	name: z.string().regex(/^[\p{L}_][\p{L}\p{N}_$-]*$/u),
	field: z.string().regex(/^[\p{L}_][\p{L}\p{N}_$-]*$/u),
	transforms: z.array(pathTransformSchema).optional(),
})

/** Persisted variable configuration validated at the Directus metadata boundary. */
export type PathTemplateVariable = z.output<typeof pathTemplateVariableSchema>
