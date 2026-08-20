import { z } from 'zod'

/**
 * Minimal Directus field metadata required to discover Sluggernaut configuration.
 * Unknown properties remain accepted because the FieldsService returns the complete metadata
 * object and Directus can add version-specific fields.
 */
export const fieldMetadataSchema = z.looseObject({
	field: z.string(),
	meta: z
		.looseObject({
			interface: z.string().nullable().optional(),
			sort: z.number().finite().nullable().optional(),
			options: z.unknown().optional(),
		})
		.nullable()
		.optional(),
	schema: z.looseObject({ is_primary_key: z.boolean().optional() }).nullable().optional(),
})

export type SluggernautFieldMetadata = z.output<typeof fieldMetadataSchema>
