import { z } from 'zod'

import { DataScope } from './lib/config'
import { SYSTEM_COLLECTIONS_ORDER } from './seeders/system/config'

/** Normalize Directus's singular or pre-cast list values without re-parsing environment strings. */
const stringListSchema = z.preprocess(
	(value) => (value === undefined || Array.isArray(value) ? value : [value]),
	z.array(z.string().trim().min(1)).default([]),
)

/** Startup configuration after Directus environment type casting. */
export const envSchema = z.object({
	SEEDER_ENABLED: z.boolean().default(true),
	SEEDER_CONFIG_PATH: z.string().trim().min(1).optional(),
	SEEDER_SCOPE: z.string().toLowerCase().pipe(z.enum(DataScope)).default(DataScope.SYSTEM),
	SEEDER_INCLUDE: stringListSchema,
	SEEDER_EXCLUDE: stringListSchema,
	SEEDER_CONTINUE_ON_ERROR: z.boolean().default(false),
	SEEDER_BATCH_SIZE: z.number().int().positive().default(50),
	SEEDER_ENABLE_FULL_IDEMPOTENT: z.boolean().default(false),
	SEEDER_JSON_ONLY: z.boolean().default(false),
	SEEDER_AUTO_EXTRACT: z.boolean().default(false),
	SEEDER_AUTO_EXTRACT_INCLUDE: stringListSchema
		.pipe(z.array(z.enum(SYSTEM_COLLECTIONS_ORDER)).min(1))
		.optional(),
	SEEDER_JSON_INDENT: z
		.enum(['tab', 'space'], {
			error: 'SEEDER_JSON_INDENT must be tab or space',
		})
		.default('tab'),
	SEEDER_JSON_INDENT_SIZE: z.number().int().min(1).max(10).default(2),
	SEEDER_SEEDS_DIR: z.string().trim().min(1).default('/directus/seeds'),
	SEEDER_ASSETS_DIR: z.string().trim().min(1).default('/directus/seeds/system/assets'),
	DEPLOYMENT_ENV: z.string().optional(),
	DEFAULT_EMAIL: z.string().default('admin@example.com'),
	DEFAULT_PASSWORD: z.string().default('p4ssw0rd!'),
	STORAGE_LOCATIONS: stringListSchema.prefault(['local']).refine((values) => values.length > 0, {
		error: 'STORAGE_LOCATIONS must contain at least one location',
	}),
})

/** Validated startup values shared by every Seeder runtime path. */
export type SeederOptions = z.infer<typeof envSchema>
