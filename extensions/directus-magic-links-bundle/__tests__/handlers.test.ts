import type { MagicLinksEnv } from '../src/magic-links-endpoint/env.schema'

import { InternalServerError, InvalidCredentialsError, InvalidOtpError } from '@directus/errors'
import { describe, expect, it, vi } from 'vitest'

import {
	redeemMagicLink,
	requestMagicLink,
	sendMagicLinkEmail,
} from '../src/magic-links-endpoint/handlers'
import { hashToken } from '../src/magic-links-endpoint/helpers'
import { getMagicLinkRefreshContext } from '../src/shared/magic-link-refresh-context'

type QueryFake = ReturnType<typeof vi.fn> & {
	select: ReturnType<typeof vi.fn>
	where: ReturnType<typeof vi.fn>
	whereNull: ReturnType<typeof vi.fn>
	join: ReturnType<typeof vi.fn>
	forUpdate: ReturnType<typeof vi.fn>
	first: ReturnType<typeof vi.fn>
	insert: ReturnType<typeof vi.fn>
	update: ReturnType<typeof vi.fn>
	returning: ReturnType<typeof vi.fn>
	fn: { now: ReturnType<typeof vi.fn> }
}

const options: MagicLinksEnv = {
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
	DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
	DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'fs',
	DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
	SYNCHRONIZATION_STORE: 'memory',
	REDIS_ENABLED: false,
	SECRET: 'directus-secret',
	MAGIC_LINKS_ENABLED: true,
	MAGIC_LINKS_COLLECTION: 'magic_links',
	MAGIC_LINKS_TOKEN_TTL: '15m',
	MAGIC_LINKS_REQUEST_RATE_LIMIT: 5,
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
	MAGIC_LINKS_TOKEN_QUERY_PARAMETER: 'token',
	MAGIC_LINKS_EMAIL_TEMPLATE: 'magic-link',
	MAGIC_LINKS_EMAIL_SUBJECT: 'Sign in',
	MAGIC_LINKS_EMAIL_REPLY_TO: 'support@example.com',
	MAGIC_LINKS_EMAIL_SENDER: 'Example <no-reply@example.com>',
	EMAIL_TRANSPORT: 'smtp',
	EMAIL_VERIFY_SETUP: true,
	EMAIL_TEMPLATES_PATH: './templates',
	EMAIL_SENDMAIL_NEW_LINE: 'unix',
	EMAIL_SENDMAIL_PATH: '/usr/sbin/sendmail',
	EMAIL_MAILGUN_HOST: 'api.mailgun.net',
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
		insert: vi.fn(() => query),
		update: vi.fn(() => query),
		returning: vi.fn(() => [{ id: 'link-id' }]),
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

type HandlerContext = Parameters<typeof requestMagicLink>[0]['context']
type TestInput = Record<string, unknown>

const createContext = (input: TestInput): HandlerContext =>
	({ database: input.database, getSchema, services: input.services }) as unknown as HandlerContext

const runRequest = (input: TestInput) =>
	requestMagicLink({
		context: createContext(input),
		options: input.options as MagicLinksEnv,
		request: {
			secret: input.secret as string,
			payload: input.payload as Parameters<typeof requestMagicLink>[0]['request']['payload'],
			ip: input.ip as string | null,
			userAgent: input.userAgent as string | null,
		},
	})
const runRedeem = (input: TestInput) =>
	redeemMagicLink({
		context: createContext(input),
		options: input.options as MagicLinksEnv,
		request: {
			secret: input.secret as string,
			payload: input.payload as Parameters<typeof redeemMagicLink>[0]['request']['payload'],
			ip: input.ip as string | null,
			userAgent: input.userAgent as string | null,
			origin: input.origin as string | null | undefined,
			limiter: input.limiter as Parameters<typeof redeemMagicLink>[0]['request']['limiter'],
		},
	})
const runSend = (input: TestInput) =>
	sendMagicLinkEmail({
		context: createContext(input),
		options: input.options as MagicLinksEnv,
		schema: input.schema as Parameters<typeof sendMagicLinkEmail>[0]['schema'],
		user: input.user as { email: string; linkId: string },
		request: {
			payload: input.payload as Parameters<
				typeof sendMagicLinkEmail
			>[0]['request']['payload'],
			rawToken: input.rawToken as string,
			expiresAt: input.expiresAt as Date,
			issuedAt: input.issuedAt as Date,
			ip: input.ip as string | null,
			userAgent: input.userAgent as string | null,
		},
	})

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
		expect(userQuery.returning).toHaveBeenCalledWith('id')
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

	it('locks, refreshes through Directus, and consumes a token exactly once', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_email: 'user@example.com',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: null,
		})
		const transaction = createTransaction(linkQuery)
		const database = createDatabase(transaction)
		const refresh = vi.fn(() => {
			expect(getMagicLinkRefreshContext()).toEqual({ userId: 'user-id' })
			return {
				accessToken: 'access',
				refreshToken: 'refresh',
				expires: 900_000,
				id: 'user-id',
			}
		})

		await expect(
			runRedeem({
				database,
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { refresh }
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: '123456', mode: 'session' },
			}),
		).resolves.toMatchObject({ accessToken: 'access' })

		expect(linkQuery.forUpdate).toHaveBeenCalledOnce()
		expect(linkQuery.insert).toHaveBeenCalledWith(
			expect.objectContaining({ user: 'user-id', token: expect.any(String) }),
		)
		expect(refresh).toHaveBeenCalledWith(expect.any(String), { session: true })
		expect(linkQuery.update).toHaveBeenCalledWith({ redeemed_at: 'now' })
		expect(linkQuery.returning).toHaveBeenCalledWith('id')
		expect(getMagicLinkRefreshContext()).toBeUndefined()
	})

	it('forwards token mode to Directus refresh', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: null,
		})
		const refresh = vi.fn(() => ({ accessToken: 'access' }))

		await runRedeem({
			database: createDatabase(createTransaction(linkQuery)),
			getSchema,
			services: {
				AuthenticationService: vi.fn(function () {
					return { refresh }
				}),
			},
			options,
			secret: 'secret',
			payload: { token: 'raw-token', mode: 'json' },
		})

		expect(refresh).toHaveBeenCalledWith(expect.any(String), { session: false })
	})

	it('does not consume a token when OTP or authentication fails', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: null,
		})
		const transaction = createTransaction(linkQuery)
		const database = createDatabase(transaction)
		const refresh = vi.fn(() => {
			throw new InvalidCredentialsError()
		})

		await expect(
			runRedeem({
				database,
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { refresh }
					}),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: 'wrong', mode: 'json' },
			}),
		).rejects.toBeInstanceOf(InvalidCredentialsError)
		expect(linkQuery.insert).toHaveBeenCalledOnce()
		expect(linkQuery.update).not.toHaveBeenCalled()
	})

	it('requires and verifies OTP before creating a bootstrap session', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: 'tfa-secret',
		})
		const verifyOTP = vi.fn(() => false)
		const refresh = vi.fn(() => ({ accessToken: 'access' }))
		const services = {
			TFAService: vi.fn(function () {
				return { verifyOTP }
			}),
			AuthenticationService: vi.fn(function () {
				return { refresh }
			}),
		}

		await expect(
			runRedeem({
				database: createDatabase(createTransaction(linkQuery)),
				getSchema,
				services,
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: 'wrong', mode: 'json' },
			}),
		).rejects.toBeInstanceOf(InvalidOtpError)

		expect(verifyOTP).toHaveBeenCalledWith('user-id', 'wrong', 'tfa-secret')
		expect(linkQuery.insert).not.toHaveBeenCalled()
		expect(refresh).not.toHaveBeenCalled()

		verifyOTP.mockReturnValue(true)
		await expect(
			runRedeem({
				database: createDatabase(createTransaction(linkQuery)),
				getSchema,
				services,
				options,
				secret: 'secret',
				payload: { token: 'raw-token', otp: 'correct', mode: 'json' },
			}),
		).resolves.toMatchObject({ accessToken: 'access' })
		expect(linkQuery.update).toHaveBeenCalledWith({ redeemed_at: 'now' })
	})

	it('consumes failed OTP attempts and clears the counter after redemption', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: 'tfa-secret',
		})
		const consume = vi.fn().mockResolvedValue(undefined)
		const deleteKey = vi.fn().mockResolvedValue(undefined)
		const limiter = { consume, delete: deleteKey }
		const verifyOTP = vi.fn(() => true)

		await runRedeem({
			database: createDatabase(createTransaction(linkQuery)),
			getSchema,
			services: {
				TFAService: vi.fn(function () {
					return { verifyOTP }
				}),
				AuthenticationService: vi.fn(function () {
					return { refresh: vi.fn(() => ({ accessToken: 'access' })) }
				}),
			},
			options,
			secret: 'secret',
			limiter,
			payload: { token: 'raw-token', otp: '123456', mode: 'json' },
		})

		expect(consume).toHaveBeenCalledWith('link-id')
		expect(deleteKey).toHaveBeenCalledWith('link-id')
	})

	it('stops OTP validation after the limiter rejects a repeated attempt', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: 'tfa-secret',
		})
		const consume = vi
			.fn<() => Promise<void>>()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValue(new Error('rate limited'))
		const verifyOTP = vi.fn(() => false)
		const input = {
			database: createDatabase(createTransaction(linkQuery)),
			getSchema,
			services: {
				TFAService: vi.fn(function () {
					return { verifyOTP }
				}),
				AuthenticationService: vi.fn(),
			},
			options,
			secret: 'secret',
			limiter: { consume, delete: vi.fn().mockResolvedValue(undefined) },
			payload: { token: 'raw-token', otp: 'wrong', mode: 'json' },
		}

		await expect(runRedeem(input)).rejects.toBeInstanceOf(InvalidOtpError)
		await expect(runRedeem(input)).rejects.toBeInstanceOf(InternalServerError)
		expect(verifyOTP).toHaveBeenCalledOnce()
	})

	it('rejects a TFA-enabled user without an OTP before creating a session', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: 'tfa-secret',
		})

		await expect(
			runRedeem({
				database: createDatabase(createTransaction(linkQuery)),
				getSchema,
				services: {
					TFAService: vi.fn(),
					AuthenticationService: vi.fn(),
				},
				options,
				secret: 'secret',
				payload: { token: 'raw-token', mode: 'json' },
			}),
		).rejects.toBeInstanceOf(InvalidOtpError)

		expect(linkQuery.insert).not.toHaveBeenCalled()
	})

	it('redeems a TFA-enabled link after valid OTP verification', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: 'tfa-secret',
		})
		const verifyOTP = vi.fn(() => true)
		const refresh = vi.fn(() => ({ accessToken: 'access' }))

		await runRedeem({
			database: createDatabase(createTransaction(linkQuery)),
			getSchema,
			services: {
				TFAService: vi.fn(function () {
					return { verifyOTP }
				}),
				AuthenticationService: vi.fn(function () {
					return { refresh }
				}),
			},
			options,
			secret: 'secret',
			payload: { token: 'raw-token', otp: '123456', mode: 'json' },
		})

		expect(linkQuery.insert).toHaveBeenCalledOnce()
		expect(refresh).toHaveBeenCalledOnce()
	})

	it('rejects missing, expired, inactive, or already redeemed links before refresh', async () => {
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
			const refresh = vi.fn()

			await expect(
				runRedeem({
					database: createDatabase(transaction),
					getSchema,
					services: {
						AuthenticationService: vi.fn(function () {
							return { refresh }
						}),
					},
					options,
					secret: 'secret',
					payload: { token: 'raw-token', mode: 'json' },
				}),
			).rejects.toBeInstanceOf(InvalidCredentialsError)
			expect(refresh).not.toHaveBeenCalled()
			expect(linkQuery.update).not.toHaveBeenCalled()
		}
	})

	it('rejects a redemption when the conditional consume update loses a race', async () => {
		const linkQuery = createQuery({
			id: 'link-id',
			user_id: 'user-id',
			user_status: 'active',
			user_provider: 'default',
			user_tfa_secret: null,
		})
		linkQuery.returning.mockReturnValue([])
		const transaction = createTransaction(linkQuery)
		const refresh = vi.fn(() => ({ accessToken: 'access' }))

		await expect(
			runRedeem({
				database: createDatabase(transaction),
				getSchema,
				services: {
					AuthenticationService: vi.fn(function () {
						return { refresh }
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
