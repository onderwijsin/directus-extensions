import { describe, expect, it } from 'vitest'

import { createDirectusE2EClient, customEndpoint } from '../../../packages/test-utils/src'
import { DEFAULT_READ_DEPLOYMENTS_POLICY_ID } from '../src/shared/constants'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN

if (!baseUrl || !token) {
	throw new Error('DIRECTUS_E2E_URL and DIRECTUS_E2E_TOKEN are required for endpoint E2E tests')
}

const client = createDirectusE2EClient({
	baseUrl,
	token,
	composeFiles: JSON.parse(process.env.DIRECTUS_E2E_COMPOSE_FILES ?? '[]') as string[],
	composeProject: process.env.DIRECTUS_E2E_COMPOSE_PROJECT ?? '',
})

const requestStatus = async (request: () => Promise<unknown>): Promise<number> => {
	try {
		await request()
	} catch (error: unknown) {
		if (typeof error === 'object' && error !== null && 'response' in error) {
			const response = error.response
			if (response instanceof Response) return response.status
		}
		throw error
	}

	throw new Error('Expected the request to fail')
}

describe('Coolify deployment endpoint middleware', () => {
	it('rejects unauthenticated requests', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/projects`)

		expect(response.status).toBe(403)
	})

	it('rejects authenticated cross-origin requests', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/projects`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Origin: 'https://evil.example.com',
			},
		})

		expect(response.status).toBe(403)
	})

	it('allows authenticated same-origin requests to reach the route', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/projects`, {
			headers: { Authorization: `Bearer ${token}` },
		})

		// The route is intentionally a placeholder; this proves middleware passed
		// without making any request to a Coolify instance.
		expect(response.status).toBe(501)
	})

	it('rejects an authenticated user without the route policy', async () => {
		const user = await client.createEphemeralUser({
			role: {
				name: 'Coolify no-policy role',
				policies: [{ name: 'Coolify API role' }],
			},
		})
		try {
			const status = await client.withUserContext(user.id, (userClient) =>
				requestStatus(() =>
					userClient.request(
						customEndpoint({
							path: '/coolify-deployments/projects/one/deployments',
							method: 'GET',
						}),
					),
				),
			)
			expect(status).toBe(403)

			await client.request(
				customEndpoint({
					path: '/access',
					method: 'POST',
					body: JSON.stringify([
						{ user: user.id, policy: DEFAULT_READ_DEPLOYMENTS_POLICY_ID },
					]),
				}),
			)
			const authorizedStatus = await client.withUserContext(user.id, (userClient) =>
				requestStatus(() =>
					userClient.request(
						customEndpoint({
							path: '/coolify-deployments/projects/one/deployments',
							method: 'GET',
						}),
					),
				),
			)
			expect(authorizedStatus).toBe(501)
		} finally {
			await user.dispose()
		}
	})
})
