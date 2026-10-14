import type { z } from 'zod'
import type { gridOptionsSchema } from './options.schema'

/** Validated polygon grid options. */
export type GridOptions = z.infer<typeof gridOptionsSchema>
