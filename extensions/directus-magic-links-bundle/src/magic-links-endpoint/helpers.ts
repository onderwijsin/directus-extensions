import { createHmac, randomBytes } from 'node:crypto'

import { InternalServerError } from '@directus/errors'
import { attemptSync } from '@onderwijsin/directus-extension-utils'

import { parseAllowedRedirectUrl } from './redirect-url'

const DURATION_PATTERN = /^(?<amount>\d+)(?<unit>ms|s|m|h|d|w)$/u

/**
 * Generates a URL-safe token with 256 bits of entropy.
 * @returns A raw token.
 */
export const generateRawToken = (): string => randomBytes(32).toString('base64url')

/** Creates the hexadecimal HMAC-SHA-256 digest stored for a token.
 * @param token - Raw token to digest.
 * @param secret - HMAC key.
 * @returns The hexadecimal digest.
 */
export const hashToken = (token: string, secret: string): string =>
	createHmac('sha256', secret).update(token).digest('hex')

/** Normalizes an email for case-insensitive lookup and delivery.
 * @param email - Email address to normalize.
 * @returns The normalized email address.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()

/** Returns whether a redirect URL exactly matches an allowlisted normalized URL.
 * @param value - Redirect URL to validate.
 * @param allowlist - Normalized configured URLs.
 * @returns Whether the URL is allowed.
 */
export const isAllowedRedirectUrl = (value: string, allowlist: string[]): boolean => {
	const url = parseAllowedRedirectUrl(value)
	if (!url) return false

	const { data, error } = attemptSync(() =>
		allowlist.some((allowed) => {
			const allowedUrl = parseAllowedRedirectUrl(allowed)
			return allowedUrl?.toString() === url.toString()
		}),
	)

	if (error || !data) return false
	return data
}

/** Parses a configured duration into milliseconds.
 * @param value - Duration such as `15m`.
 * @returns The duration in milliseconds.
 */
export const parseDuration = (value: string): number => {
	const match = DURATION_PATTERN.exec(value.trim())
	if (!match?.groups) throw new InternalServerError()

	const amount = Number(match.groups.amount)
	const unit = match.groups.unit
	if (!unit) throw new InternalServerError()
	const multipliers: Record<string, number> = {
		ms: 1,
		s: 1_000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
		w: 604_800_000,
	}

	const multiplier = multipliers[unit]
	if (multiplier === undefined) throw new InternalServerError()
	const milliseconds = amount * multiplier
	if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
		throw new InternalServerError()
	}
	return milliseconds
}

export const GENERIC_RESPONSE = {
	message: 'If an account exists for this email address, a sign-in link has been sent.',
} as const
