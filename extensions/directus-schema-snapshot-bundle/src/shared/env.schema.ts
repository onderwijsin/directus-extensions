import { z } from 'zod'

import { parseBooleanEnv } from './parseBooleanEnv'

/** Snapshot folder defaults and boolean parsing after Directus environment casting. */
export const envSchema = z.object({
	SCHEMA_SPLIT_MANAGEMENT_SNAPSHOT_FOLDER: z
		.unknown()
		.optional()
		.transform((value) =>
			typeof value === 'string' && value.trim().length > 0
				? value.trim()
				: '/directus/snapshots',
		),
	SCHEMA_SPLIT_MANAGEMENT_AUTO_SNAPSHOT: z.unknown().optional().transform(parseBooleanEnv),
})
