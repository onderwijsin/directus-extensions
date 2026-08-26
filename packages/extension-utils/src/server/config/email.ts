import { z } from 'zod'

const nonBlankStringSchema = z.string().trim().min(1)
const portSchema = z.coerce.number().int().min(1).max(65_535)

/** Directus email environment values, without transport prerequisites. */
export const emailConfigSchema = z.object({
	EMAIL_VERIFY_SETUP: z.boolean().default(true),
	EMAIL_TRANSPORT: z.enum(['sendmail', 'smtp', 'mailgun', 'ses']).default('sendmail'),
	EMAIL_FROM: nonBlankStringSchema.default('no-reply@example.com'),
	EMAIL_TEMPLATES_PATH: nonBlankStringSchema.default('./templates'),
	EMAIL_SENDMAIL_NEW_LINE: z.enum(['unix', 'windows']).default('unix'),
	EMAIL_SENDMAIL_PATH: nonBlankStringSchema.default('/usr/sbin/sendmail'),
	EMAIL_SMTP_HOST: nonBlankStringSchema.optional(),
	EMAIL_SMTP_PORT: portSchema.optional(),
	EMAIL_SMTP_USER: nonBlankStringSchema.optional(),
	EMAIL_SMTP_PASSWORD: nonBlankStringSchema.optional(),
	EMAIL_SMTP_POOL: z.boolean().optional(),
	EMAIL_SMTP_SECURE: z.boolean().optional(),
	EMAIL_SMTP_IGNORE_TLS: z.boolean().optional(),
	EMAIL_SMTP_NAME: nonBlankStringSchema.optional(),
	EMAIL_MAILGUN_API_KEY: nonBlankStringSchema.optional(),
	EMAIL_MAILGUN_DOMAIN: nonBlankStringSchema.optional(),
	EMAIL_MAILGUN_HOST: nonBlankStringSchema.default('api.mailgun.net'),
	EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID: nonBlankStringSchema.optional(),
	EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY: nonBlankStringSchema.optional(),
	EMAIL_SES_REGION: nonBlankStringSchema.optional(),
})

/** Email environment values with prerequisites for the selected transport. */
export const requiredEmailConfigSchema = emailConfigSchema.superRefine((options, context) => {
	if (options.EMAIL_TRANSPORT === 'smtp') {
		if (!options.EMAIL_SMTP_HOST) {
			context.addIssue({
				code: 'custom',
				path: ['EMAIL_SMTP_HOST'],
				message: 'is required for smtp',
			})
		}
	}
	if (options.EMAIL_TRANSPORT === 'mailgun') {
		for (const key of ['EMAIL_MAILGUN_API_KEY', 'EMAIL_MAILGUN_DOMAIN'] as const) {
			if (!options[key])
				context.addIssue({
					code: 'custom',
					path: [key],
					message: `is required for mailgun`,
				})
		}
	}
	if (options.EMAIL_TRANSPORT === 'ses') {
		for (const key of [
			'EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID',
			'EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY',
			'EMAIL_SES_REGION',
		] as const) {
			if (!options[key])
				context.addIssue({ code: 'custom', path: [key], message: 'is required for ses' })
		}
	}
})

export type EmailConfig = z.output<typeof emailConfigSchema>

/**
 * Checks whether the selected Directus email transport is configured.
 * @param options - Email environment values.
 * @returns Whether the required transport configuration is valid.
 */
export function isEmailConfigured(options: unknown): boolean {
	return requiredEmailConfigSchema.safeParse(options).success
}
