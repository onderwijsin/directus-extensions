import { z } from 'zod'

/**
 * Directus supplies a cast environment record. Preserve each option's legacy defaults
 * and coercion in parseEnvConfig instead of imposing new ranges or list conventions.
 */
export const envSchema = z.record(z.string(), z.unknown())
