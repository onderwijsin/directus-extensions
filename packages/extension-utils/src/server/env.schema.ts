import { z } from 'zod'

/**
 * Validates global schema change configuration.
 *
 * @returns Validated schema for global schema change permissions.
 */
export const schemaChangeSchema = z.object({
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	DIRECTUS_EXTENSIONS_USE_LOCKED_SCHEMA_CHANGE: z.boolean().default(true),
})

export type SchemaChangeOptions = z.output<typeof schemaChangeSchema>
