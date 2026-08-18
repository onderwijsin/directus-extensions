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

interface MagicLinkRecord {
	token_hash: string
	email_status: string
}

describe('magic-links request endpoint', () => {
	it('delivers a link and stores only its digest', async () => {
		const email = `magic-links-e2e-${Date.now()}@example.com`
		let userId: string | undefined

		try {
			const user = await client.request(
				createUser({ email, password: `unused-${Date.now()}`, status: 'active' }),
			)
			userId = user.id

			await expect(
				client.request(
					customEndpoint({
						path: '/auth/magic-links/request',
						method: 'POST',
						body: JSON.stringify({
							email,
							redirectUrl: 'https://app.example.com/auth/magic-link',
						}),
					}),
				),
			).resolves.toEqual({
				message:
					'If an account exists for this email address, a sign-in link has been sent.',
			})

			const links = await client.request<MagicLinkRecord[]>(
				customEndpoint({
					path: `/items/magic_links?filter[user][_eq]=${encodeURIComponent(userId)}&fields=token_hash,email_status`,
					method: 'GET',
				}),
			)
			expect(links).toHaveLength(1)
			expect(links[0]).toMatchObject({ email_status: 'sent' })
			expect(links[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/u)

			const messages = await fetch(`${mailpitUrl}/api/v1/search?query=to:${email}`).then(
				async (result) => {
					if (!result.ok) throw new Error(`Mailpit search failed: ${result.status}`)
					return (await result.json()) as { messages: unknown[] }
				},
			)
			expect(messages.messages.length).toBeGreaterThan(0)
		} finally {
			if (userId) await client.request(deleteUser(userId))
		}
	})
})
