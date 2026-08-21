import { z } from 'zod'

/** Validated input accepted by the Sluggernaut recalculation operation. */
export const recalculateOptionsSchema = z
	.strictObject({
		collection: z.string().trim().min(1),
		fields: z.array(z.string().trim().min(1)).optional(),
		/** @deprecated Use `fields`, which is the current Studio option name. */
		fieldKeys: z.array(z.string().trim().min(1)).optional(),
		createRedirects: z.boolean().default(true),
	})
	.transform(({ fields, fieldKeys, ...options }) => ({
		...options,
		fields: fields ?? fieldKeys,
	}))

/** Parsed recalculation options with defaults applied. */
export type RecalculateOptions = z.output<typeof recalculateOptionsSchema>
