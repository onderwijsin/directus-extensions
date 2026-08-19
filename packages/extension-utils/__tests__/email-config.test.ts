import { describe, expect, it } from 'vitest'

import {
	emailConfigSchema,
	isEmailConfigured,
	requiredEmailConfigSchema,
} from '../src/server/config/email'

describe('email configuration', () => {
	it('accepts an empty base configuration with Directus defaults', () => {
		expect(emailConfigSchema.parse({})).toMatchObject({
			EMAIL_VERIFY_SETUP: true,
			EMAIL_TRANSPORT: 'sendmail',
			EMAIL_FROM: 'no-reply@example.com',
			EMAIL_TEMPLATES_PATH: './templates',
		})
		expect(isEmailConfigured({})).toBe(true)
	})

	it('validates all supported transports', () => {
		expect(requiredEmailConfigSchema.safeParse({}).success).toBe(true)
		expect(
			requiredEmailConfigSchema.safeParse({
				EMAIL_TRANSPORT: 'smtp',
				EMAIL_SMTP_HOST: 'smtp.example.com',
				EMAIL_SMTP_PORT: 587,
			}).success,
		).toBe(true)
		expect(
			requiredEmailConfigSchema.safeParse({
				EMAIL_TRANSPORT: 'mailgun',
				EMAIL_MAILGUN_API_KEY: 'key',
				EMAIL_MAILGUN_DOMAIN: 'mg.example.com',
			}).success,
		).toBe(true)
		expect(
			requiredEmailConfigSchema.safeParse({
				EMAIL_TRANSPORT: 'ses',
				EMAIL_SES_CREDENTIALS__ACCESS_KEY_ID: 'access',
				EMAIL_SES_CREDENTIALS__SECRET_ACCESS_KEY: 'secret',
				EMAIL_SES_REGION: 'eu-west-1',
			}).success,
		).toBe(true)
	})

	it('rejects incomplete transport configuration without throwing from the helper', () => {
		expect(requiredEmailConfigSchema.safeParse({ EMAIL_TRANSPORT: 'smtp' }).success).toBe(false)
		expect(
			requiredEmailConfigSchema.safeParse({
				EMAIL_TRANSPORT: 'smtp',
				EMAIL_SMTP_HOST: 'smtp.example.com',
				EMAIL_SMTP_PORT: 587,
				EMAIL_SMTP_USER: 'user',
			}).success,
		).toBe(false)
		expect(isEmailConfigured({ EMAIL_TRANSPORT: 'mailgun' })).toBe(false)
		expect(isEmailConfigured({ EMAIL_TRANSPORT: 'invalid' })).toBe(false)
	})

	it('rejects invalid ports, blank values, and newline styles', () => {
		expect(emailConfigSchema.safeParse({ EMAIL_SMTP_PORT: 0 }).success).toBe(false)
		expect(emailConfigSchema.safeParse({ EMAIL_FROM: ' ' }).success).toBe(false)
		expect(emailConfigSchema.safeParse({ EMAIL_SENDMAIL_NEW_LINE: 'invalid' }).success).toBe(
			false,
		)
	})
})
