import { createHmac } from 'node:crypto'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createPolicy,
	createRole,
	createUser,
	customEndpoint,
	deletePolicy,
	deleteRole,
	deleteUser,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT

if (!baseUrl || !token || !composeFilesValue || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })
const mailpitUrl = `http://127.0.0.1:${process.env.DIRECTUS_E2E_MAILPIT_PORT ?? '18025'}`
const magicLinksSecret = 'development-magic-links-secret'

interface MailpitSearchResult {
	messages: { ID: string }[]
}

interface MailpitMessage {
	HTML: string
	Text: string
}

interface TfaGenerateResponse {
	data: {
		secret: string
		otpauth_url: string
	}
}

const readTokenFromMailpit = async (email: string): Promise<string> => {
	const deadline = Date.now() + 10_000
	while (Date.now() < deadline) {
		const search = await fetch(`${mailpitUrl}/api/v1/search?query=to:${email}`).then(
			async (result) => {
				if (!result.ok) throw new Error(`Mailpit search failed: ${result.status}`)
				return (await result.json()) as MailpitSearchResult
			},
		)
		const messageId = search.messages.at(-1)?.ID
		if (messageId) {
			const message = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`).then(
				async (result) => {
					if (!result.ok)
						throw new Error(`Mailpit message fetch failed: ${result.status}`)
					return (await result.json()) as MailpitMessage
				},
			)
			const match = /[?&]token=([^&"<]+)/u.exec(`${message.HTML}\n${message.Text}`)
			if (match?.[1]) return decodeURIComponent(match[1])
		}
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	throw new Error('Mailpit did not contain the magic-link message')
}

const requestToken = async (email: string): Promise<string> => {
	await client.request(
		customEndpoint({
			path: '/auth/magic-links/request',
			method: 'POST',
			body: JSON.stringify({
				email,
				redirectUrl: 'https://app.example.com/auth/magic-link',
			}),
		}),
	)
	return readTokenFromMailpit(email)
}

const createMagicLink = async (
	userId: string,
	token: string,
	expiresAt = new Date(Date.now() + 60_000),
	redeemedAt?: string,
): Promise<string> => {
	const response = await client.request<{ id: string }>(
		customEndpoint({
			path: '/items/custom_links',
			method: 'POST',
			body: JSON.stringify({
				user: userId,
				token_hash: createHmac('sha256', magicLinksSecret).update(token).digest('hex'),
				expires_at: expiresAt.toISOString(),
				issued_at: new Date().toISOString(),
				redeemed_at: redeemedAt,
				email_status: 'sent',
			}),
		}),
	)
	return response.id
}

const decodeBase32 = (value: string): Buffer => {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
	const normalized = value.replace(/=+$/u, '').toUpperCase()
	let bits = 0
	let buffer = 0
	const bytes: number[] = []

	for (const character of normalized) {
		const index = alphabet.indexOf(character)
		if (index < 0) throw new Error(`Invalid base32 character: ${character}`)
		buffer = (buffer << 5) | index
		bits += 5
		if (bits >= 8) {
			bits -= 8
			bytes.push((buffer >>> bits) & 0xff)
		}
	}

	return Buffer.from(bytes)
}

const createTotp = (secret: string, timestamp = Date.now()): string => {
	const counter = Math.floor(timestamp / 30_000)
	const counterBuffer = Buffer.alloc(8)
	counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0)
	counterBuffer.writeUInt32BE(counter >>> 0, 4)
	const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest()
	const offset = digest[digest.length - 1]! & 0x0f
	const code =
		((digest[offset]! & 0x7f) << 24) |
		((digest[offset + 1]! & 0xff) << 16) |
		((digest[offset + 2]! & 0xff) << 8) |
		(digest[offset + 3]! & 0xff)

	return String(code % 1_000_000).padStart(6, '0')
}

describe('magic-links redeem endpoint', () => {
	it('redeems a delivered token, supports cookie and session modes, and enforces single use', async () => {
		const users: string[] = []
		try {
			const jsonEmail = `magic-links-redeem-json-${Date.now()}@example.com`
			const jsonUser = await client.request(
				createUser({
					email: jsonEmail,
					password: `unused-${Date.now()}`,
					status: 'active',
				}),
			)
			users.push(jsonUser.id)
			const jsonToken = await requestToken(jsonEmail)

			await expect(
				client.request(
					customEndpoint({
						path: '/auth/magic-links/redeem',
						method: 'POST',
						body: JSON.stringify({ token: jsonToken, mode: 'json' }),
					}),
				),
			).resolves.toMatchObject({
				access_token: expect.any(String),
				refresh_token: expect.any(String),
			})
			await expect(
				client.request(
					customEndpoint({
						path: '/auth/magic-links/redeem',
						method: 'POST',
						body: JSON.stringify({ token: jsonToken, mode: 'json' }),
					}),
				),
			).rejects.toThrow()

			for (const mode of ['cookie', 'session'] as const) {
				const email = `magic-links-redeem-${mode}-${Date.now()}@example.com`
				const user = await client.request(
					createUser({ email, password: `unused-${Date.now()}`, status: 'active' }),
				)
				users.push(user.id)
				const response = await fetch(`${baseUrl}/auth/magic-links/redeem`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ token: await requestToken(email), mode }),
				})
				expect(response.status).toBe(200)
				expect(response.headers.get('set-cookie')).toContain(
					mode === 'cookie' ? 'directus_refresh_token=' : 'directus_session_token=',
				)
			}
		} finally {
			for (const userId of users) await client.request(deleteUser(userId))
		}
	})

	it('keeps unknown-user requests generic', async () => {
		await expect(
			client.request(
				customEndpoint({
					path: '/auth/magic-links/request',
					method: 'POST',
					body: JSON.stringify({
						email: `missing-${Date.now()}@example.com`,
						redirectUrl: 'https://app.example.com/auth/magic-link',
					}),
				}),
			),
		).resolves.toEqual({
			message: 'If an account exists for this email address, a sign-in link has been sent.',
		})
	})

	it('passes Directus TFA errors through and supports OTP retry redemption', async () => {
		const password = `magic-links-tfa-password-${Date.now()}`
		let userId: string | undefined
		let roleId: string | undefined
		let policyId: string | undefined

		try {
			const policy = await client.request(
				createPolicy({
					name: `Magic-links TFA policy ${Date.now()}`,
					enforce_tfa: true,
					app_access: true,
					admin_access: true,
				}),
			)
			policyId = policy.id
			const role = await client.request(
				createRole({ name: `Magic-links TFA role ${Date.now()}` }),
			)
			roleId = role.id
			await client.request(
				customEndpoint({
					path: '/access',
					method: 'POST',
					body: JSON.stringify([{ role: role.id, policy: policy.id }]),
				}),
			)

			const email = `magic-links-tfa-${Date.now()}@example.com`
			const user = await client.request(
				createUser({
					email,
					password,
					status: 'active',
					role: role.id,
				}),
			)
			userId = user.id

			const loginResponse = await fetch(`${baseUrl}/auth/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password }),
			})
			expect(loginResponse.status).toBe(200)
			const login = await loginResponse.json()
			const accessToken = login.data.access_token
			const tfaHeaders = {
				'content-type': 'application/json',
				authorization: `Bearer ${accessToken}`,
			}
			const generatedResponse = await fetch(`${baseUrl}/users/me/tfa/generate`, {
				method: 'POST',
				headers: tfaHeaders,
				body: JSON.stringify({ password }),
			})
			expect(generatedResponse.status).toBe(200)
			const generated: TfaGenerateResponse = await generatedResponse.json()
			const enableResponse = await fetch(`${baseUrl}/users/me/tfa/enable`, {
				method: 'POST',
				headers: tfaHeaders,
				body: JSON.stringify({
					secret: generated.data.secret,
					otp: createTotp(generated.data.secret),
				}),
			})
			expect(enableResponse.status).toBe(204)
			const tfaSecret = generated.data.secret
			const token = `magic-links-tfa-token-${Date.now()}`
			await createMagicLink(user.id, token)

			const firstResponse = await fetch(`${baseUrl}/auth/magic-links/redeem`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, mode: 'json' }),
			})
			expect(firstResponse.status).toBe(401)
			expect(await firstResponse.json()).toEqual({
				errors: [{ message: 'Invalid user OTP.', extensions: { code: 'INVALID_OTP' } }],
			})

			const invalidOtpResponse = await fetch(`${baseUrl}/auth/magic-links/redeem`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, otp: '000000', mode: 'json' }),
			})
			expect(invalidOtpResponse.status).toBe(401)
			expect(await invalidOtpResponse.json()).toEqual({
				errors: [{ message: 'Invalid user OTP.', extensions: { code: 'INVALID_OTP' } }],
			})

			await expect(
				client.request(
					customEndpoint({
						path: '/auth/magic-links/redeem',
						method: 'POST',
						body: JSON.stringify({ token, otp: createTotp(tfaSecret), mode: 'json' }),
					}),
				),
			).resolves.toMatchObject({
				access_token: expect.any(String),
				refresh_token: expect.any(String),
			})
		} finally {
			if (userId) await client.request(deleteUser(userId))
			if (roleId) await client.request(deleteRole(roleId))
			if (policyId) await client.request(deletePolicy(policyId))
		}
	})

	it('rejects expired and inactive links generically', async () => {
		const users: string[] = []
		const links: string[] = []
		try {
			const cases = [
				{
					label: 'expired',
					expiresAt: new Date(Date.now() - 60_000),
					status: 'active',
				},
				{
					label: 'inactive',
					expiresAt: new Date(Date.now() + 60_000),
					status: 'suspended',
				},
			] as const

			for (const testCase of cases) {
				const email = `magic-links-${testCase.label}-${Date.now()}@example.com`
				const user = await client.request(
					createUser({
						email,
						password: `unused-${Date.now()}`,
						status: testCase.status,
					}),
				)
				users.push(user.id)

				const token = `magic-links-${testCase.label}-token-${Date.now()}`
				links.push(await createMagicLink(user.id, token, testCase.expiresAt))
				const response = await fetch(`${baseUrl}/auth/magic-links/redeem`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ token, mode: 'json' }),
				})

				expect(response.status).toBe(401)
				expect(await response.json()).toEqual({
					errors: [
						{
							message: 'Invalid user credentials.',
							extensions: { code: 'INVALID_CREDENTIALS' },
						},
					],
				})
			}
		} finally {
			for (const linkId of links)
				await client
					.request(
						customEndpoint({ path: `/items/custom_links/${linkId}`, method: 'DELETE' }),
					)
					.catch(() => undefined)
			for (const userId of users) await client.request(deleteUser(userId))
		}
	})
})
