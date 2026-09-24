import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'
import { validateCronExpression } from 'cron'
import { z } from 'zod'

import { defineSharedMagicLinksOptions } from '../shared/env.schema'

/**
 * Builds a Directus cron expression validator with the supplied Zod runtime.
 * @param zod - The Zod runtime.
 * @returns A validated cron expression schema.
 */
function createCronSchema(zod: typeof z) {
	return zod
		.string()
		.trim()
		.refine((value: string): boolean => validateCronExpression(value).valid, {
			error: 'must be a valid cron expression',
		})
}

/**
 * Schema for cron expressions accepted by Directus.
 */
export const cronSchema = createCronSchema(z)

/**
 * Validates the environment values used by the magic-links hook entrypoint.
 *
 * @returns The hook environment definition.
 */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig],
	/**
	 * Builds hook fields and shared magic-links fields with one Zod runtime.
	 * @param zod - The package-owned Zod runtime.
	 * @returns Hook environment fields.
	 */
	options: (zod) => ({
		...defineSharedMagicLinksOptions(zod),
		MAGIC_LINKS_SCHEMA_CHANGES_ENABLED: zod.boolean().default(true),
		MAGIC_LINKS_SCHEMA_ABORT_ON_ERROR: zod.boolean().default(true),
		MAGIC_LINKS_DOCS_SEED_ENABLED: zod.boolean().default(true),
		USE_MAGIC_LINK_CLEANUP: zod.boolean().default(false),
		MAGIC_LINK_CLEANUP_WINDOW: zod
			.string()
			.trim()
			.regex(/^\d+(?:ms|s|m|h|d|w)$/u)
			.default('24h'),
		MAGIC_LINK_CLEANUP_CRON: createCronSchema(zod).default('*/15 * * * *'),
	}),
})

export type MagicLinksEnv =
	typeof envSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never
