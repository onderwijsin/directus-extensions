import {
	defineExtensionOptionsSchema,
	directusStartupConfig,
	requiredEmailConfig,
	type ExtensionOptionsDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import { defineSharedMagicLinksOptions } from '../shared/env.schema'
import { parseAllowedRedirectUrl } from './redirect-url'

/**
 * Validates the environment values used by the magic-links endpoint entrypoint.
 *
 * @returns The endpoint environment definition.
 */
export const envSchema = defineExtensionOptionsSchema({
	include: [directusStartupConfig, requiredEmailConfig],
	/**
	 * Builds endpoint fields and shared magic-links fields with one Zod runtime.
	 * @param z - The package-owned Zod runtime.
	 * @returns Endpoint environment fields.
	 */
	options: (z) => {
		const durationSchema = z
			.string()
			.trim()
			.regex(/^\d+(?:ms|s|m|h|d|w)$/u)
		const nameSchema = z
			.string()
			.trim()
			.regex(/^[A-Za-z0-9_-]+$/u)
		const redirectUrlSchema = z
			.url()
			.refine(
				(value) => parseAllowedRedirectUrl(value) !== undefined,
				'Must be an HTTP or HTTPS URL without credentials',
			)

		return {
			...defineSharedMagicLinksOptions(z),
			SECRET: z.string().trim().min(1),
			MAGIC_LINKS_TOKEN_SECRET: z.string().trim().min(1).optional(),
			MAGIC_LINKS_TOKEN_TTL: durationSchema.default('15m'),
			MAGIC_LINKS_REQUEST_RATE_LIMIT: z.coerce.number().int().positive().default(5),
			MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: z.array(redirectUrlSchema).min(1),
			MAGIC_LINKS_TOKEN_QUERY_PARAMETER: nameSchema.default('token'),
			MAGIC_LINKS_EMAIL_TEMPLATE: nameSchema.default('magic-link'),
			MAGIC_LINKS_EMAIL_SUBJECT: z.string().trim().min(1).optional(),
			MAGIC_LINKS_EMAIL_PREVIEW_TEXT: z.string().trim().min(1).optional(),
			MAGIC_LINKS_EMAIL_REPLY_TO: z.email().trim().optional(),
			MAGIC_LINKS_EMAIL_SENDER: z.string().trim().min(1).optional(),
		}
	},
})

export type MagicLinksEnv =
	typeof envSchema extends ExtensionOptionsDefinition<infer Options> ? Options : never
