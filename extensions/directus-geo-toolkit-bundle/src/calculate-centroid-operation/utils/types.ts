import type { z } from 'zod'
import type { centroidOptionsSchema } from './options.schema'

/** Validated centroid operation options. */
export type CentroidOptions = z.infer<typeof centroidOptionsSchema>
