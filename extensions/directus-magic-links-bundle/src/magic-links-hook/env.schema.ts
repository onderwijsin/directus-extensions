import { validateCronExpression } from 'cron'
import { z } from 'zod'

import { sharedEnvSchema } from '../shared/env.schema'

const durationSchema = z
	.string()
	.trim()
	.regex(/^\d+(?:ms|s|m|h|d|w)$/u)

/**
 * Schema for cron expressions accepted by Directus.
 */
export const cronSchema = z
	.string()
	.trim()
	.refine((value: string): boolean => validateCronExpression(value).valid, {
		error: 'must be a valid cron expression',
	})

/**
 * Validates the environment values used by the magic-links hook entrypoint.
 *
 * @returns The hook environment schema.
 */
export const envSchema = sharedEnvSchema.extend({
	MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: z.boolean().default(true),
	MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR: z.boolean().default(true),
	MAGIC_LINKS_DOCS_SEED_ENABLED: z.boolean().default(true),
	USE_MAGIC_LINK_CLEANUP: z.boolean().default(false),
	MAGIC_LINK_CLEANUP_WINDOW: durationSchema.default('24h'),
	MAGIC_LINK_CLEANUP_CRON: cronSchema.default('*/15 * * * *'),
})

export type MagicLinksEnv = z.output<typeof envSchema>
