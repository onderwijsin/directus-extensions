import { requiredEmailConfigSchema } from '@onderwijsin/directus-extension-utils/server'
import { z } from 'zod'

import { sharedEnvSchema } from '../shared/env.schema'
import { parseAllowedRedirectUrl } from './redirect-url'

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

/**
 * Validates the environment values used by the magic-links endpoint entrypoint.
 *
 * @returns The endpoint environment schema.
 */
export const envSchema = sharedEnvSchema
	.safeExtend({
		SECRET: z.string().trim().min(1),
		MAGIC_LINKS_TOKEN_SECRET: z.string().trim().min(1).optional(),
		MAGIC_LINKS_TOKEN_TTL: durationSchema.default('15m'),
		MAGIC_LINKS_REQUEST_RATE_LIMIT: z.coerce.number().int().positive().default(5),
		MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: z.array(redirectUrlSchema).min(1),
		MAGIC_LINKS_TOKEN_QUERY_PARAMETER: nameSchema.default('token'),
		MAGIC_LINKS_EMAIL_TEMPLATE: nameSchema.default('magic-link'),
		MAGIC_LINKS_EMAIL_SUBJECT: z.string().trim().min(1).optional(),
		MAGIC_LINKS_EMAIL_REPLY_TO: z.email().trim().optional(),
		MAGIC_LINKS_EMAIL_SENDER: z.string().trim().min(1).optional(),
	})
	.and(requiredEmailConfigSchema)

export type MagicLinksEnv = z.output<typeof envSchema>
