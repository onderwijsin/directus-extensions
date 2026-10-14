import type { z } from 'zod'
import type { extractionOptionsSchema } from './options.schema'

/** Validated extraction configuration. */
export type ExtractionOptions = z.infer<typeof extractionOptionsSchema>
