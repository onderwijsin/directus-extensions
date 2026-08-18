import { createDirectusE2EClient } from '@workspace/test-utils'
import { createUser, customEndpoint, deleteUser } from '@workspace/test-utils/commands'
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

interface MailpitSearchResult {
	messages: { ID: string }[]
}

interface MailpitMessage {
	HTML: string
	Text: string
}

const readTokenFromMailpit = async (email: string): Promise<string> => {
	const search = await fetch(`${mailpitUrl}/api/v1/search?query=to:${email}`).then(
		async (result) => {
			if (!result.ok) throw new Error(`Mailpit search failed: ${result.status}`)
			return (await result.json()) as MailpitSearchResult
		},
	)
	const messageId = search.messages.at(-1)?.ID
	if (!messageId) throw new Error('Mailpit did not contain the magic-link message')

	const message = await fetch(`${mailpitUrl}/api/v1/message/${messageId}`).then(
		async (result) => {
			if (!result.ok) throw new Error(`Mailpit message fetch failed: ${result.status}`)
			return (await result.json()) as MailpitMessage
		},
	)
	const match = /[?&]token=([^&"<]+)/u.exec(`${message.HTML}\n${message.Text}`)
	if (!match?.[1]) throw new Error('Magic-link token was not present in delivered content')
	return decodeURIComponent(match[1])
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
				data: { access_token: expect.any(String), refresh_token: expect.any(String) },
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
})
