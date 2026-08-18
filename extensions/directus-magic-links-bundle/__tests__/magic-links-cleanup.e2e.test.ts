import { createDirectusE2EClient } from '@workspace/test-utils'
import { createUser, deleteUser, customEndpoint } from '@workspace/test-utils/commands'
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

const createMagicLink = async (body: Record<string, unknown>): Promise<string> => {
	const response = await client.request<{ id: string }>(
		customEndpoint({
			path: '/items/custom_links',
			method: 'POST',
			body: JSON.stringify(body),
		}),
	)
	return response.id
}

const deleteMagicLink = async (id: string): Promise<void> => {
	await client.request(customEndpoint({ path: `/items/custom_links/${id}`, method: 'DELETE' }))
}

const readMagicLink = async (id: string): Promise<unknown> =>
	client.request(customEndpoint({ path: `/items/custom_links/${id}`, method: 'GET' }))

const waitForMagicLinkDeletion = async (id: string): Promise<void> => {
	const deadline = Date.now() + 10_000
	while (Date.now() < deadline) {
		try {
			await readMagicLink(id)
		} catch {
			return
		}
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
	throw new Error(`Magic link ${id} was not deleted by scheduled cleanup`)
}

describe('magic-links scheduled cleanup', () => {
	it('removes stale expired and redeemed links but keeps fresh links', async () => {
		const user = await client.request(
			createUser({
				email: `magic-links-cleanup-${Date.now()}@example.com`,
				password: `unused-${Date.now()}`,
				status: 'active',
			}),
		)
		const old = '2000-01-01T00:00:00.000Z'
		const future = new Date(Date.now() + 86_400_000).toISOString()
		const linkIds: string[] = []

		try {
			const expiredId = await createMagicLink({
				user: user.id,
				token_hash: `expired-${Date.now()}`,
				expires_at: old,
				issued_at: old,
				email_status: 'pending',
			})
			linkIds.push(expiredId)

			const redeemedId = await createMagicLink({
				user: user.id,
				token_hash: `redeemed-${Date.now()}`,
				expires_at: future,
				issued_at: old,
				redeemed_at: old,
				email_status: 'sent',
			})
			linkIds.push(redeemedId)

			const freshId = await createMagicLink({
				user: user.id,
				token_hash: `fresh-${Date.now()}`,
				expires_at: future,
				issued_at: new Date().toISOString(),
				email_status: 'pending',
			})
			linkIds.push(freshId)

			await waitForMagicLinkDeletion(expiredId)
			await waitForMagicLinkDeletion(redeemedId)
			await expect(deleteMagicLink(freshId)).resolves.toBeUndefined()
		} finally {
			for (const linkId of linkIds) {
				await deleteMagicLink(linkId).catch(() => undefined)
			}
			await client.request(deleteUser(user.id))
		}
	})
})
