import { z } from 'zod'

import {
	createExtensionOptionsConfigFragment,
	defineExtensionOptionsShape,
	type ExtensionOptionsRefinementContext,
	type ExtensionOptionsRefinementValues,
	type ExtensionOptionsShapeBuilder,
} from '../schema-builder'

/**
 * Builds email fields for raw schemas and fragments.
 * @param zod - Package-owned Zod runtime.
 * @returns The email configuration shape.
 */
const defineEmailConfigShape = (zod: typeof z) => {
	const nonBlankStringSchema = zod.string().trim().min(1)
	const portSchema = zod.coerce.number().int().min(1).max(65_535)

	return {
		EMAIL_VERIFY_SETUP: zod.boolean().default(true),
		EMAIL_TRANSPORT: zod.enum(['sendmail', 'smtp', 'mailgun', 'ses']).default('sendmail'),
		EMAIL_FROM: nonBlankStringSchema.default('no-reply@example.com'),
		EMAIL_TEMPLATES_PATH: nonBlankStringSchema.default('./templates'),
		EMAIL_SENDMAIL_NEW_LINE: zod.enum(['unix', 'windows']).default('unix'),
		EMAIL_SENDMAIL_PATH: nonBlankStringSchema.default('/usr/sbin/sendmail'),
		EMAIL_SMTP_HOST: nonBlankStringSchema.optional(),
		EMAIL_SMTP_PORT: portSchema.optional(),
		EMAIL_SMTP_USER: nonBlankStringSchema.optional(),
		EMAIL_SMTP_PASSWORD: nonBlankStringSchema.optional(),
		EMAIL_SMTP_POOL: zod.boolean().optional(),
		EMAIL_SMTP_SECURE: zod.boolean().optional(),
		EMAIL_SMTP_IGNORE_TLS: zod.boolean().optional(),
		EMAIL_SMTP_NAME: nonBlankStringSchema.optional(),
		EMAIL_MAILGUN_API_KEY: nonBlankStringSchema.optional(),
		EMAIL_MAILGUN_DOMAIN: nonBlankStringSchema.optional(),
		EMAIL_MAILGUN_HOST: nonBlankStringSchema.default('api.mailgun.net'),
		EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID: nonBlankStringSchema.optional(),
		EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY: nonBlankStringSchema.optional(),
		EMAIL_SES_REGION: nonBlankStringSchema.optional(),
	}
}

/** Directus email environment values, without transport prerequisites. */
export const emailConfigSchema = z.object(defineEmailConfigShape(z))

/**
 * Validates prerequisites for the selected email transport.
 * @param options - Parsed shared email options.
 * @param context - Refinement issue collector.
 * @returns Nothing.
 */
const refineRequiredEmailConfig = (
	options: ExtensionOptionsRefinementValues,
	context: ExtensionOptionsRefinementContext,
): void => {
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
}

/** Email environment values with prerequisites for the selected transport. */
export const requiredEmailConfigSchema = emailConfigSchema.superRefine(refineRequiredEmailConfig)

export type EmailConfig = z.output<typeof emailConfigSchema>

/** Shared optional email configuration for declarative options composition. */
export const emailConfig = createExtensionOptionsConfigFragment<EmailConfig>({
	name: 'emailConfig',
	shape: defineEmailConfigShape,
})

/**
 * Keeps required email as a refinement-only fragment.
 * @returns An empty configuration shape.
 */
const defineRequiredEmailConfigShape = () => ({})

/** Shared required email configuration for declarative options composition. */
export const requiredEmailConfig = createExtensionOptionsConfigFragment<EmailConfig>({
	dependencies: [emailConfig],
	name: 'requiredEmailConfig',
	refine: refineRequiredEmailConfig,
	shape: defineRequiredEmailConfigShape,
})

/**
 * Defines extension options that include the shared optional email configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineEmailConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(emailConfig, builder)

/**
 * Defines extension options that include required transport-specific email configuration.
 *
 * @param builder - Builds extension-specific fields with the package-owned Zod runtime.
 * @returns An opaque definition accepted by `validateExtensionOptions`.
 */
export const defineRequiredEmailConfigSchema = <const Shape extends z.ZodRawShape>(
	builder: ExtensionOptionsShapeBuilder<Shape>,
) => defineExtensionOptionsShape(requiredEmailConfig, builder)

/**
 * Checks whether the selected Directus email transport is configured.
 * @param options - Email environment values.
 * @returns Whether the required transport configuration is valid.
 */
export function isEmailConfigured(options: unknown): boolean {
	return requiredEmailConfigSchema.safeParse(options).success
}
