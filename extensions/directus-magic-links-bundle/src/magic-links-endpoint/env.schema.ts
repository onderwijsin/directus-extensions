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
const nonBlankStringSchema = z.string().trim().min(1)

/**
 * Validates the environment values used by the magic-links endpoint entrypoint.
 *
 * @returns The endpoint environment schema.
 */
export const envSchema = sharedEnvSchema
	.extend({
		MAGIC_LINKS_TOKEN_SECRET: z.string().trim().min(1).optional(),
		MAGIC_LINKS_TOKEN_TTL: durationSchema.default('15m'),
		MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: z.array(redirectUrlSchema).min(1).default([]),
		MAGIC_LINKS_TOKEN_QUERY_PARAMETER: nameSchema.default('token'),
		MAGIC_LINKS_EMAIL_TEMPLATE: nameSchema.default('magic-link'),
		MAGIC_LINKS_EMAIL_SUBJECT: z.string().trim().min(1).optional(),
		MAGIC_LINKS_EMAIL_REPLY_TO: z.email().trim().optional(),
		MAGIC_LINKS_EMAIL_SENDER: z.string().trim().min(1).optional(),
		EMAIL_TRANSPORT: z.literal('smtp'),
		EMAIL_SMTP_HOST: nonBlankStringSchema,
		EMAIL_SMTP_PORT: z.coerce.number().int().positive(),
		EMAIL_FROM: nonBlankStringSchema,
		EMAIL_SMTP_USER: nonBlankStringSchema.optional(),
		EMAIL_SMTP_PASSWORD: nonBlankStringSchema.optional(),
	})
	.superRefine((options, context) => {
		if (Boolean(options.EMAIL_SMTP_USER) !== Boolean(options.EMAIL_SMTP_PASSWORD)) {
			context.addIssue({
				code: 'custom',
				path: ['EMAIL_SMTP_USER'],
				message: 'EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD must be configured together',
			})
		}
	})

export type MagicLinksEnv = z.output<typeof envSchema>
