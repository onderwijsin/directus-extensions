import { describe, expect, it, vi } from 'vitest'

import { parseRequestPayload } from '../src/magic-links-endpoint/handlers'
import {
	generateRawToken,
	hashToken,
	isAllowedRedirectUrl,
	normalizeEmail,
	parseDuration,
} from '../src/magic-links-endpoint/helpers'
import { redeemSchema } from '../src/magic-links-endpoint/schema'
import { sendAuthenticationResponse } from '../src/magic-links-endpoint/session'

describe('magic-link security helpers', () => {
	it('generates unique URL-safe tokens and deterministic digests', () => {
		const first = generateRawToken()
		const second = generateRawToken()

		expect(first).not.toBe(second)
		expect(first).toMatch(/^[A-Za-z0-9_-]+$/u)
		expect(hashToken(first, 'secret')).toHaveLength(64)
		expect(hashToken(first, 'secret')).toBe(hashToken(first, 'secret'))
		expect(hashToken(first, 'secret')).not.toBe(hashToken(first, 'other-secret'))
	})

	it('normalizes email addresses and validates exact redirects', () => {
		expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com')
		const allowlist = ['https://app.example.com/auth/magic-link']

		expect(isAllowedRedirectUrl('https://app.example.com/auth/magic-link', allowlist)).toBe(
			true,
		)
		expect(isAllowedRedirectUrl('https://app.example.com/other', allowlist)).toBe(false)
		expect(
			isAllowedRedirectUrl('https://app.example.com/auth/magic-link?next=x', allowlist),
		).toBe(false)
		expect(
			isAllowedRedirectUrl('https://user:pass@app.example.com/auth/magic-link', allowlist),
		).toBe(false)
		expect(
			isAllowedRedirectUrl('https://app.example.com:8443/auth/magic-link', allowlist),
		).toBe(false)
		expect(isAllowedRedirectUrl('http://app.example.com/auth/magic-link', allowlist)).toBe(
			false,
		)
		expect(isAllowedRedirectUrl('javascript:alert(1)', allowlist)).toBe(false)
	})

	it('accepts the exact URL that passed configuration validation', async () => {
		const { envSchema } = await import('../src/magic-links-endpoint/env.schema')
		const environment = envSchema.parse({
			SECRET: 'directus-secret',
			MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
			EMAIL_TRANSPORT: 'sendmail',
			EMAIL_FROM: 'noreply@example.com',
		})

		expect(
			isAllowedRedirectUrl(
				'https://app.example.com/auth/magic-link',
				environment.MAGIC_LINKS_REDIRECT_URL_ALLOWLIST,
			),
		).toBe(true)
	})

	it('parses supported durations and rejects overflow', () => {
		expect(parseDuration('15m')).toBe(900_000)
		expect(parseDuration('2h')).toBe(7_200_000)
		expect(() => parseDuration('0ms')).toThrow()
		expect(() => parseDuration('999999999999999999999d')).toThrow()
	})

	it('accepts redeem modes and rejects missing or blank tokens', () => {
		expect(redeemSchema.parse({ token: 'raw-token' })).toMatchObject({ mode: 'json' })
		expect(
			redeemSchema.parse({ token: 'raw-token', otp: '123456', mode: 'session' }),
		).toMatchObject({
			mode: 'session',
		})
		expect(redeemSchema.safeParse({ token: ' ' }).success).toBe(false)
		expect(redeemSchema.safeParse({ token: 'raw-token', mode: 'redirect' }).success).toBe(false)
	})

	it('rejects request redirects outside the configured allowlist', () => {
		expect(() =>
			parseRequestPayload(
				{ email: 'user@example.com', redirectUrl: 'https://evil.example.com/link' },
				['https://app.example.com/auth/magic-link'],
			),
		).toThrow()
	})

	it('maps authentication results to the three Directus session modes', () => {
		const result = {
			accessToken: 'access-token',
			refreshToken: 'refresh-token',
			expires: 900_000,
			id: 'user-id',
		}
		const environment = {
			REFRESH_TOKEN_COOKIE_NAME: 'refresh-cookie',
			REFRESH_TOKEN_COOKIE_TTL: '7d',
			SESSION_COOKIE_NAME: 'session-cookie',
			SESSION_COOKIE_TTL: '1d',
		}

		const jsonResponse = { cookie: vi.fn(), json: vi.fn() }
		sendAuthenticationResponse(
			jsonResponse,
			environment,
			{ token: 'token', mode: 'json' },
			result,
		)
		expect(jsonResponse.cookie).not.toHaveBeenCalled()
		expect(jsonResponse.json).toHaveBeenCalledWith({
			data: {
				access_token: 'access-token',
				refresh_token: 'refresh-token',
				expires: 900_000,
				id: 'user-id',
			},
		})

		const cookieResponse = { cookie: vi.fn(), json: vi.fn() }
		sendAuthenticationResponse(
			cookieResponse,
			environment,
			{ token: 'token', mode: 'cookie' },
			result,
		)
		expect(cookieResponse.cookie).toHaveBeenCalledWith(
			'refresh-cookie',
			'refresh-token',
			expect.objectContaining({ httpOnly: true, maxAge: 604_800_000 }),
		)

		const sessionResponse = { cookie: vi.fn(), json: vi.fn() }
		sendAuthenticationResponse(
			sessionResponse,
			environment,
			{ token: 'token', mode: 'session' },
			result,
		)
		expect(sessionResponse.cookie).toHaveBeenCalledWith(
			'session-cookie',
			'access-token',
			expect.objectContaining({ httpOnly: true, maxAge: 86_400_000 }),
		)
		expect(sessionResponse.json).toHaveBeenCalledWith({
			data: { expires: 900_000, id: 'user-id' },
		})
	})

	it('uses Directus-compatible cookie defaults and security settings', () => {
		const response = { cookie: vi.fn(), json: vi.fn() }
		sendAuthenticationResponse(
			response,
			{
				REFRESH_TOKEN_COOKIE_DOMAIN: 'auth.example.com',
				REFRESH_TOKEN_COOKIE_TTL: '2d',
				REFRESH_TOKEN_COOKIE_SECURE: true,
				REFRESH_TOKEN_COOKIE_SAME_SITE: 'lax',
			},
			{ token: 'token', mode: 'cookie' },
			{ accessToken: 'access', refreshToken: 'refresh', expires: 100, id: 'user' },
		)
		expect(response.cookie).toHaveBeenCalledWith(
			'directus_refresh_token',
			'refresh',
			expect.objectContaining({
				maxAge: 172_800_000,
				domain: 'auth.example.com',
				secure: true,
				sameSite: 'lax',
			}),
		)

		const sessionResponse = { cookie: vi.fn(), json: vi.fn() }
		sendAuthenticationResponse(
			sessionResponse,
			{},
			{ token: 'token', mode: 'session' },
			{ accessToken: 'access', refreshToken: 'refresh', expires: 100, id: 'user' },
		)
		expect(sessionResponse.cookie).toHaveBeenCalledWith(
			'directus_session_token',
			'access',
			expect.objectContaining({ maxAge: 86_400_000, sameSite: 'strict', secure: false }),
		)
	})
})
