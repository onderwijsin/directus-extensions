import type { Limiter } from '@directus/memory'
import type { ApiExtensionContext, PrimaryKey } from '@directus/types'
import type { MagicLinksEnv } from './env.schema'

import { randomBytes } from 'node:crypto'

import {
	InternalServerError,
	InvalidCredentialsError,
	InvalidOtpError,
	InvalidPayloadError,
	isDirectusError,
} from '@directus/errors'
import { attempt, uuid } from '@onderwijsin/directus-extension-utils'

import { runAsMagicLinkRefresh } from '../shared/magic-link-refresh-context'
import {
	GENERIC_RESPONSE,
	generateRawToken,
	hashToken,
	isAllowedRedirectUrl,
	normalizeEmail,
	parseDuration,
} from './helpers'
import { requestSchema, redeemSchema, type RequestPayload, type RedeemPayload } from './schema'

const DEFAULT_AUTH_PROVIDER = 'default'

interface BaseRequest<TPayload> {
	payload: TPayload
	ip: string | null
	userAgent: string | null
}

type AuthenticatedRequest<TPayload> = BaseRequest<TPayload> & {
	secret: string
}

interface RequestHandlerInput {
	request: AuthenticatedRequest<RequestPayload>
	options: MagicLinksEnv
	context: ApiExtensionContext
}

interface RedeemHandlerInput {
	request: AuthenticatedRequest<RedeemPayload> & {
		origin?: string | null
		limiter?: Limiter | null
	}
	options: MagicLinksEnv
	context: ApiExtensionContext
}

interface MagicLinkEmailInput {
	request: BaseRequest<RequestPayload> & {
		rawToken: string
		expiresAt: Date
		issuedAt: Date
	}
	options: MagicLinksEnv
	context: ApiExtensionContext
	schema: Awaited<ReturnType<ApiExtensionContext['getSchema']>>
	user: { email: string; linkId: string }
}

interface RedeemableMagicLink {
	id: string
	user_id: PrimaryKey
	user_email: string
	user_status: string | null
	user_provider: string | null
	user_tfa_secret: string | null
}

/**
 * Re-throws an attempted operation error while preserving a safe fallback.
 * @param error - Captured operation error.
 * @returns Never; always throws.
 */
const throwAttemptError = (error: unknown): never => {
	if (isDirectusError(error)) throw error
	throw new InternalServerError()
}

const BOOTSTRAP_SESSION_TTL_MS = 5 * 60 * 1000

/**
 * Parses the request body and validates its redirect target.
 * @param body - Untrusted request body.
 * @param allowlist - Configured redirect URLs.
 * @returns The validated request payload.
 */
export const parseRequestPayload = (body: unknown, allowlist: string[]): RequestPayload => {
	const parsed = requestSchema.safeParse(body)
	if (!parsed.success)
		throw new InvalidPayloadError({ reason: 'Invalid magic link request body' })
	if (!isAllowedRedirectUrl(parsed.data.redirectUrl, allowlist)) {
		throw new InvalidPayloadError({ reason: 'Redirect URL is not allowlisted' })
	}
	return parsed.data
}

/**
 * Parses the redemption body at the endpoint boundary.
 * @param body - Untrusted request body.
 * @returns The validated redemption payload.
 */
export const parseRedeemPayload = (body: unknown): RedeemPayload => {
	const parsed = redeemSchema.safeParse(body)
	if (!parsed.success)
		throw new InvalidPayloadError({ reason: 'Invalid magic link redeem payload' })
	return parsed.data
}

/**
 * Creates and delivers a magic link, retaining a generic public response.
 * @param input - Request operation dependencies and payload.
 * @returns The generic public response.
 */
export async function requestMagicLink(input: RequestHandlerInput) {
	const { context, options, request } = input
	const { payload, secret } = request
	const rawToken = generateRawToken()
	const tokenHash = hashToken(rawToken, secret)
	const issuedAt = new Date()
	const expiresAt = new Date(issuedAt.getTime() + parseDuration(options.MAGIC_LINKS_TOKEN_TTL))
	const email = normalizeEmail(payload.email)
	const schema = await context.getSchema()
	const transactionResult = await attempt(() =>
		context.database.transaction(async (transaction) => {
			const record = await transaction('directus_users')
				.select('id', 'email')
				.where({ email, status: 'active', provider: DEFAULT_AUTH_PROVIDER })
				.first<{ id: string; email: string }>()
			if (!record) return null

			const [inserted] = await transaction(options.MAGIC_LINKS_COLLECTION)
				.insert({
					id: uuid(), // Yes really. Directus generates uuid's in the service layer... Shocking!
					user: record.id,
					token_hash: tokenHash,
					expires_at: expiresAt,
					issued_at: issuedAt,
					ip: request.ip,
					user_agent: request.userAgent,
					email_status: 'pending',
				})
				.returning('id')
			return {
				email: String(record.email),
				linkId: String(inserted.id),
			}
		}),
	)
	if (transactionResult.error) throwAttemptError(transactionResult.error)
	const user = transactionResult.data

	if (!user) return GENERIC_RESPONSE

	const delivery = await attempt(() =>
		sendMagicLinkEmail({
			context,
			options,
			schema,
			user,
			request: {
				payload,
				rawToken,
				expiresAt,
				issuedAt,
				ip: request.ip,
				userAgent: request.userAgent,
			},
		}),
	)
	if (delivery.error) {
		await attempt(() =>
			context
				.database(options.MAGIC_LINKS_COLLECTION)
				.where({ id: user.linkId })
				.update({ email_status: 'error', email_error: 'Email delivery failed' }),
		)
	}

	return GENERIC_RESPONSE
}

/**
 * Sends the configured magic-link email and marks the record as sent.
 * @param input - Email delivery dependencies and values.
 * @returns A promise completed after transport accepts the message.
 */
export async function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<void> {
	const { context, options, request, schema, user } = input
	const url = new URL(request.payload.redirectUrl)
	url.searchParams.set(options.MAGIC_LINKS_TOKEN_QUERY_PARAMETER, request.rawToken)
	const mail = new context.services.MailService({ knex: context.database, schema })

	await mail.send({
		to: user.email,
		subject: options.MAGIC_LINKS_EMAIL_SUBJECT ?? 'Your sign-in link',
		replyTo: options.MAGIC_LINKS_EMAIL_REPLY_TO ?? undefined,
		sender: options.MAGIC_LINKS_EMAIL_SENDER ?? undefined,
		template: {
			name: options.MAGIC_LINKS_EMAIL_TEMPLATE,
			data: {
				url: url.toString(),
				email: user.email,
				expires_at: request.expiresAt.toISOString(),
				issued_at: request.issuedAt.toISOString(),
				ip: request.ip,
				user_agent: request.userAgent,
			},
		},
	})

	await context
		.database(options.MAGIC_LINKS_COLLECTION)
		.where({ id: user.linkId })
		.update({ email_status: 'sent' })
}

/**
 * Authenticates and atomically consumes a magic link.
 * @param input - Redemption operation dependencies and payload.
 * @returns The Directus authentication result.
 */
export async function redeemMagicLink(input: RedeemHandlerInput) {
	const { context, options, request } = input
	const { limiter, origin, payload, secret } = request
	const digest = hashToken(payload.token, secret)
	const schema = await context.getSchema()

	const result = await attempt(() =>
		context.database.transaction(async (transaction) => {
			const link = await transaction(`${options.MAGIC_LINKS_COLLECTION} as magic_links`)
				.select(
					'magic_links.id',
					'users.id as user_id',
					'users.email as user_email',
					'users.status as user_status',
					'users.provider as user_provider',
					'users.tfa_secret as user_tfa_secret',
				)
				.join('directus_users as users', 'users.id', 'magic_links.user')
				.where({ token_hash: digest })
				.whereNull('magic_links.redeemed_at')
				.where('magic_links.expires_at', '>', transaction.fn.now())
				.forUpdate()
				.first<RedeemableMagicLink>()

			if (link?.user_status !== 'active' || link?.user_provider !== DEFAULT_AUTH_PROVIDER) {
				throw new InvalidCredentialsError()
			}

			if (link.user_tfa_secret !== null) {
				if (limiter) await limiter.consume(link.id)
				if (!payload.otp) throw new InvalidOtpError()

				const tfaService = new context.services.TFAService({
					knex: transaction,
					schema,
				})
				const otpValid = await tfaService.verifyOTP(
					link.user_id,
					payload.otp,
					link.user_tfa_secret,
				)
				if (!otpValid) throw new InvalidOtpError()
			}

			const bootstrapToken = randomBytes(32).toString('hex')
			await transaction('directus_sessions').insert({
				token: bootstrapToken,
				user: link.user_id,
				expires: new Date(Date.now() + BOOTSTRAP_SESSION_TTL_MS),
				ip: request.ip,
				user_agent: request.userAgent,
				origin: origin ?? null,
			})

			const authentication = new context.services.AuthenticationService({
				knex: transaction,
				schema,
				accountability: null,
			})
			const { id: _, ...session } = await runAsMagicLinkRefresh(link.user_id, () =>
				authentication.refresh(bootstrapToken, {
					session: payload.mode === 'session',
				}),
			)

			const updated = await transaction(options.MAGIC_LINKS_COLLECTION)
				.where({ id: link.id, redeemed_at: null })
				.update({ redeemed_at: transaction.fn.now() })
				.returning('id')
			if (updated.length !== 1) throw new InvalidCredentialsError()
			if (limiter && link.user_tfa_secret !== null) await limiter.delete(link.id)

			return session
		}),
	)
	if (result.error) throwAttemptError(result.error)
	return result.data
}
