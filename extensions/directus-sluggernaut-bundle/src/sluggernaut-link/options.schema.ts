import { z } from 'zod'

/** Display-only options for the optional absolute host. */
export const linkDisplayOptionsSchema = z.looseObject({
	host: z.string().nullable().optional(),
})

/** Parsed link display options. */
export type LinkDisplayOptions = z.output<typeof linkDisplayOptionsSchema>
