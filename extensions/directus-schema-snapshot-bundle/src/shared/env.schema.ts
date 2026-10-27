import { z } from 'zod'

/** Snapshot folder defaults and boolean validation after Directus environment casting. */
export const envSchema = z.object({
	SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: z
		.unknown()
		.optional()
		.transform((value) =>
			typeof value === 'string' && value.trim().length > 0
				? value.trim()
				: '/directus/snapshots',
		),
	SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: z.boolean().default(false),
})
