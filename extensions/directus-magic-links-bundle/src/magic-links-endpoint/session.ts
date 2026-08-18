import type { LoginResult } from '@directus/types'
import type { CookieOptions, Response } from 'express'
import type { RedeemPayload } from './schema'

import { isNonBlankString } from '@onderwijsin/directus-extension-utils'

import { parseDuration } from './helpers'

type Environment = Record<string, unknown>

/**
 * Reads a string Directus environment value with a fallback.
 * @param environment - Directus environment values.
 * @param key - Environment key.
 * @param fallback - Value when the key is absent or blank.
 * @returns The configured or fallback string.
 */
const environmentString = (environment: Environment, key: string, fallback: string): string => {
	const value = environment[key]
	return isNonBlankString(value) ? value : fallback
}

/**
 * Reads a boolean Directus environment value.
 * @param environment - Directus environment values.
 * @param key - Environment key.
 * @returns Whether the configured value is true.
 */
const environmentBoolean = (environment: Environment, key: string): boolean =>
	environment[key] === true || environment[key] === 'true'

/**
 * Builds cookie options matching Directus authentication defaults.
 * @param environment - Directus environment values.
 * @param prefix - Cookie configuration prefix.
 * @returns Cookie options for Express.
 */
const cookieOptions = (
	environment: Environment,
	prefix: 'REFRESH_TOKEN' | 'SESSION',
): CookieOptions => {
	const domain = environmentString(environment, `${prefix}_COOKIE_DOMAIN`, '')

	return {
		httpOnly: true,
		...(domain ? { domain } : {}),
		maxAge: parseDuration(
			environmentString(
				environment,
				`${prefix}_COOKIE_TTL`,
				prefix === 'SESSION' ? '1d' : '7d',
			),
		),
		secure: environmentBoolean(environment, `${prefix}_COOKIE_SECURE`),
		sameSite: environmentString(
			environment,
			`${prefix}_COOKIE_SAME_SITE`,
			'strict',
		) as CookieOptions['sameSite'],
	}
}

/**
 * Writes a Directus-compatible authentication response for the requested session mode.
 * @param response - Express-compatible response.
 * @param environment - Directus environment values.
 * @param payload - Validated redemption payload.
 * @param result - Directus authentication result.
 * @returns Nothing; the response is written in place.
 */
export const sendAuthenticationResponse = (
	response: Pick<Response, 'cookie' | 'json'>,
	environment: Environment,
	payload: RedeemPayload,
	result: LoginResult,
): void => {
	if (payload.mode === 'json') {
		response.json({
			data: {
				access_token: result.accessToken,
				refresh_token: result.refreshToken,
				expires: result.expires,
				id: result.id,
			},
		})
		return
	}

	if (payload.mode === 'cookie') {
		response.cookie(
			environmentString(environment, 'REFRESH_TOKEN_COOKIE_NAME', 'directus_refresh_token'),
			result.refreshToken,
			cookieOptions(environment, 'REFRESH_TOKEN'),
		)
		response.json({
			data: {
				access_token: result.accessToken,
				expires: result.expires,
				id: result.id,
			},
		})
		return
	}

	response.cookie(
		environmentString(environment, 'SESSION_COOKIE_NAME', 'directus_session_token'),
		result.accessToken,
		cookieOptions(environment, 'SESSION'),
	)
	response.json({ data: { expires: result.expires, id: result.id } })
}
