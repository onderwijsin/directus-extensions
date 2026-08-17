import { z } from 'zod'

import { sharedEnvSchema } from '../shared/env.schema'

const durationSchema = z
	.string()
	.trim()
	.regex(/^\d+(?:ms|s|m|h|d|w)$/u)
const nameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z0-9_-]+$/u)
const redirectUrlSchema = z.url().refine((value) => {
	const url = new URL(value)
	return url.protocol === 'https:' && url.username === '' && url.password === ''
}, 'Must be an HTTPS URL without credentials')

/**
 * Validates the environment values used by the magic-links endpoint entrypoint.
 *
 * @returns The endpoint environment schema.
 */
export const envSchema = sharedEnvSchema.extend({
	MAGIC_LINKS_TOKEN_SECRET: z.string().trim().min(1).optional(),
	MAGIC_LINKS_TOKEN_TTL: durationSchema.default('15m'),
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: z.array(redirectUrlSchema).default([]),
	MAGIC_LINKS_TOKEN_QUERY_PARAMETER: nameSchema.default('token'),
	MAGIC_LINKS_EMAIL_TEMPLATE: nameSchema.default('magic-link'),
	MAGIC_LINKS_EMAIL_SUBJECT: z.string().trim().min(1).optional(),
})

export type MagicLinksEnv = z.output<typeof envSchema>
