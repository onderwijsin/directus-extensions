import type { MagicLinksEnv } from '../src/magic-links-endpoint/env.schema'

import { InvalidCredentialsError, InvalidOtpError } from '@directus/errors'
import { describe, expect, it, vi } from 'vitest'

import {
	redeemMagicLink,
	requestMagicLink,
	sendMagicLinkEmail,
} from '../src/magic-links-endpoint/handlers'
import { hashToken } from '../src/magic-links-endpoint/helpers'

type QueryFake = ReturnType<typeof vi.fn> & {
	select: ReturnType<typeof vi.fn>
	where: ReturnType<typeof vi.fn>
	whereNull: ReturnType<typeof vi.fn>
	join: ReturnType<typeof vi.fn>
	forUpdate: ReturnType<typeof vi.fn>
	first: ReturnType<typeof vi.fn>
	insert: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
	fn: { now: ReturnType<typeof vi.fn> }
}

const options: MagicLinksEnv = {
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
	DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'FS',
	MAGIC_LINKS_ENABLED: true,
	MAGIC_LINKS_COLLECTION: 'magic_links',
	MAGIC_LINKS_TOKEN_TTL: '15m',
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
	MAGIC_LINKS_TOKEN_QUERY_PARAMETER: 'token',
	MAGIC_LINKS_EMAIL_TEMPLATE: 'magic-link',
	MAGIC_LINKS_EMAIL_SUBJECT: 'Sign in',
	MAGIC_LINKS_EMAIL_REPLY_TO: 'support@example.com',
	MAGIC_LINKS_EMAIL_SENDER: 'Example <no-reply@example.com>',
	EMAIL_TRANSPORT: 'smtp',
	EMAIL_SMTP_HOST: 'mailpit',
	EMAIL_SMTP_PORT: 1025,
	EMAIL_FROM: 'noreply@example.com',
}

const createQuery = (first?: unknown): QueryFake => {
	const query = vi.fn() as QueryFake
	Object.assign(query, {
		select: vi.fn(() => query),
		where: vi.fn(() => query),
		whereNull: vi.fn(() => query),
		join: vi.fn(() => query),
		forUpdate: vi.fn(() => query),
		first: vi.fn(() => first),
		insert: vi.fn(() => ['link-id']),
		update: vi.fn(() => 1),
		fn: { now: vi.fn(() => 'now') },
	})
	return query
}

type TransactionFake = ReturnType<typeof vi.fn> & { fn: { now: ReturnType<typeof vi.fn> } }

const createDatabase = (transaction: TransactionFake) => {
	const database = vi.fn(() => createQuery())
	Object.assign(database, {
		transaction: vi.fn((callback: (value: typeof transaction) => unknown) =>
			callback(transaction),
		),
	})
	return database
}

const createTransaction = (query: QueryFake): TransactionFake => {
	const transaction = vi.fn(() => query)
	Object.assign(transaction, { fn: { now: vi.fn(() => 'now') } })
	return transaction as TransactionFake
}

const getSchema = vi.fn(() => ({}))

const runRequest = (input: unknown) =>
	requestMagicLink(input as Parameters<typeof requestMagicLink>[0])
const runRedeem = (input: unknown) =>
	redeemMagicLink(input as Parameters<typeof redeemMagicLink>[0])
const runSend = (input: unknown) =>
	sendMagicLinkEmail(input as Parameters<typeof sendMagicLinkEmail>[0])

describe('magic-link handlers', () => {
	it('normalizes lookup email, persists a digest, and marks delivery sent', async () => {
		const userQuery = createQuery({ id: 'user-id', email: 'current@example.com' })
		const transaction = createTransaction(userQuery)
		const database = createDatabase(transaction)
		const mailSend = vi.fn(() => undefined)
		const services = {
			MailService: vi.fn(function () {
				return { send: mailSend }
			}),
		}

		await expect(
			runRequest({
				database,
				getSchema,
				services,
				options,
				secret: 'secret',
				payload: {
					email: '  USER@EXAMPLE.COM ',
					redirectUrl: 'https://app.example.com/auth/magic-link',
				},
				ip: '127.0.0.1',
				userAgent: 'test-agent',
			}),
		).resolves.toEqual({
			message: 'If an account exists for this email address, a sign-in link has been sent.',
		})

		expect(userQuery.where).toHaveBeenCalledWith({
			email: 'user@example.com',
			status: 'active',
			provider: 'default',
		})
		expect(userQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user: 'user-id',
				token_hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
				email_status: 'pending',
				ip: '127.0.0.1',
				user_agent: 'test-agent',
			}),
		)
		expect(mailSend).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'current@example.com',
				subject: 'Sign in',
				replyTo: 'support@example.com',
				sender: 'Example <no-reply@example.com>',
			}),
		)
	})

	it('returns the same generic response for unknown users without sending mail', async () => {
		const userQuery = createQuery()
		const transaction = createTransaction(userQuery)
		const database = createDatabase(transaction)
		const mailService = vi.fn()

		await expect(
			runRequest({
				database,
				getSchema,
				services: { MailService: mailService },
				options,
				secret: 'secret',
				payload: {
					email: 'unknown@example.com',
					redirectUrl: 'https://app.example.com/auth/magic-link',
				},
				ip: null,
				userAgent: null,
			}),
		).resolves.toEqual({
			message: 'If an account exists for this email address, a sign-in link has been sent.',
		})
		expect(mailService).not.toHaveBeenCalled()
		expect(userQuery.insert).not.toHaveBeenCalled()
	})

	it('marks a link as errored when email delivery fails while preserving the response', async () => {
		const userQuery = createQuery({ id: 'user-id', email: 'user@example.com' })
		const transaction = createTransaction(userQuery)
		const database = createDatabase(transaction)
		const linkQuery = createQuery()
		database.mockImplementation(() => linkQuery)
		const mailSend = vi.fn(() => {
			throw new Error('SMTP unavailable')
		})

		await expect(
			runRequest({
				database,
				getSchema,
				services: {
					MailService: vi.fn(function () {
						return { send: mailSend }
					}),
				},
				options,
				secret: 'secret',
				payload: {
					email: 'user@example.com',
					redirectUrl: 'https://app.example.com/auth/magic-link',
				},
				ip: null,
				userAgent: null,
			}),
		).resolves.toHaveProperty('message')
		expect(linkQuery.update).toHaveBeenCalledWith({
			email_status: 'error',
			email_error: 'Email delivery failed',
		})
	})

	it('sends the configured template URL and metadata', async () => {
		const database = vi.fn(() => createQuery())
		const send = vi.fn(() => undefined)
		const issuedAt = new Date('2026-08-18T10:00:00.000Z')
		const expiresAt = new Date('2026-08-18T10:15:00.000Z')

		await runSend({
			database,
			services: {
				MailService: vi.fn(function () {
					return { send }
				}),
			},
			options,
			schema: {},
			user: { email: 'user@example.com', linkId: 'link-id' },
			payload: {
				email: 'user@example.com',
				redirectUrl: 'https://app.example.com/auth/magic-link',
			},
			rawToken: 'raw-token',
			expiresAt,
			issuedAt,
			ip: '127.0.0.1',
			userAgent: 'test-agent',
		})

		expect(send).toHaveBeenCalledWith({
			to: 'user@example.com',
			subject: 'Sign in',
			replyTo: 'support@example.com',
			sender: 'Example <no-reply@example.com>',
			template: {
				name: 'magic-link',
				data: {
					url: 'https://app.example.com/auth/magic-link?token=raw-token',
					email: 'user@example.com',
					expires_at: expiresAt.toISOString(),
					issued_at: issuedAt.toISOString(),
					ip: '127.0.0.1',
					user_agent: 'test-agent',
				},
			},
		})
	})

	it('locks, authenticates, and consumes a token exactly once', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_email: 'user@example.com',
			user_status: 'active',
			user_provider: 'default',
		})
		const transaction = createTransaction(linkQuery)
		const database = createDatabase(transaction)
		const login = vi.fn(() => ({
			accessToken: 'access',
			refreshToken: 'refresh',
			expires: 900_000,
			id: 'user-id',
		}))

		await expect(
			runRedeem({
				database,
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { login }
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: '123456', mode: 'session' },
			}),
		).resolves.toMatchObject({ accessToken: 'access' })

		expect(linkQuery.forUpdate).toHaveBeenCalledOnce()
		expect(login).toHaveBeenCalledWith(
			'default',
			{ email: 'user@example.com' },
			{ otp: '123456', session: true },
		)
		expect(linkQuery.update).toHaveBeenCalledWith({ redeemed_at: 'now' })
	})

	it('does not consume a token when OTP or authentication fails', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_email: 'user@example.com',
			user_status: 'active',
			user_provider: 'default',
		})
		const transaction = createTransaction(linkQuery)
		const database = createDatabase(transaction)
		const login = vi.fn(() => {
			throw new InvalidCredentialsError()
		})

		await expect(
			runRedeem({
				database,
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { login }
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: 'wrong', mode: 'json' },
			}),
		).rejects.toBeInstanceOf(InvalidCredentialsError)
		expect(linkQuery.update).not.toHaveBeenCalled()
	})

	it('passes Directus OTP errors through without translating them', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_email: 'user@example.com',
			user_status: 'active',
			user_provider: 'default',
		})
		const transaction = createTransaction(linkQuery)
		const database = createDatabase(transaction)
		const otpError = new InvalidOtpError()

		await expect(
			runRedeem({
				database,
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return {
							login: vi.fn(() => {
								throw otpError
							}),
						}
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', mode: 'json' },
			}),
		).rejects.toBe(otpError)
		expect(linkQuery.update).not.toHaveBeenCalled()
	})

	it('rejects missing, expired, inactive, or already redeemed links before login', async () => {
		for (const link of [
			undefined,
			{
				id: 'link-id',
				user_email: 'user@example.com',
				user_status: 'inactive',
				user_provider: 'default',
			},
			{
				id: 'link-id',
				user_email: 'user@example.com',
				user_status: 'active',
				user_provider: 'other',
			},
		]) {
			const linkQuery = createQuery(link)
			const transaction = createTransaction(linkQuery)
			const login = vi.fn()

			await expect(
				runRedeem({
					database: createDatabase(transaction),
					getSchema,
					services: {
						AuthenticationService: vi.fn(function () {
							return { login }
						}),
					},
					options,
					secret: 'secret',
					payload: { token: 'raw-token', mode: 'json' },
				}),
			).rejects.toBeInstanceOf(InvalidCredentialsError)
			expect(login).not.toHaveBeenCalled()
			expect(linkQuery.update).not.toHaveBeenCalled()
		}
	})

	it('rejects a redemption when the conditional consume update loses a race', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_email: 'user@example.com',
			user_status: 'active',
			user_provider: 'default',
		})
		linkQuery.update.mockResolvedValue(0)
		const transaction = createTransaction(linkQuery)
		const login = vi.fn(() => ({ accessToken: 'access' }))

		await expect(
			runRedeem({
				database: createDatabase(transaction),
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { login }
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', mode: 'json' },
			}),
		).rejects.toBeInstanceOf(InvalidCredentialsError)
		expect(linkQuery.where).toHaveBeenCalledWith({ id: 'link-id', redeemed_at: null })
		expect(hashToken('raw-token', 'secret')).toMatch(/^[0-9a-f]{64}$/u)
	})
})
