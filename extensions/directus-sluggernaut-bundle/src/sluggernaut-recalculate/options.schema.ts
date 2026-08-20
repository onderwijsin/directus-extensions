import { z } from 'zod'

/** Validated input accepted by the Sluggernaut recalculation operation. */
export const recalculateOptionsSchema = z.strictObject({
	collection: z.string().trim().min(1),
	fieldKeys: z.array(z.string().trim().min(1)).optional(),
	createRedirects: z.boolean().default(true),
})

/** Parsed recalculation options with defaults applied. */
export type RecalculateOptions = z.output<typeof recalculateOptionsSchema>
