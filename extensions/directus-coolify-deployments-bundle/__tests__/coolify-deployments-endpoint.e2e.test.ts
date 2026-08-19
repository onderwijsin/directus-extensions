import { describe, expect, it } from 'vitest'

import { createDirectusE2EClient, customEndpoint } from '../../../packages/test-utils/src'
import { DEFAULT_MANAGE_APPLICATIONS_POLICY_ID } from '../src/shared/constants'

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
		const response = await fetch(`${baseUrl}/coolify-deployments/applications`)

		expect(response.status).toBe(403)
	})

	it('rejects authenticated cross-origin requests', async () => {
		const response = await fetch(`${baseUrl}/coolify-deployments/applications`, {
			headers: {
				Authorization: `Bearer ${token}`,
				Origin: 'https://evil.example.com',
			},
		})

		expect(response.status).toBe(403)
	})

	it('allows authenticated same-origin requests to reach the route', async () => {
		// This route is intentionally provider-independent. Every test that exercises
		// a Coolify API operation uses mocked ofetch responses in the unit suite; the
		// E2E stack must never depend on a live Coolify instance.
		const response = await fetch(`${baseUrl}/coolify-deployments/permissions`, {
			headers: { Authorization: `Bearer ${token}` },
		})

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ canTrigger: true })
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
							path: '/coolify-deployments/applications',
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
						{ user: user.id, policy: DEFAULT_MANAGE_APPLICATIONS_POLICY_ID },
					]),
				}),
			)
			await expect(
				client.withUserContext(user.id, (userClient) =>
					userClient.request(
						customEndpoint({
							path: '/coolify-deployments/applications',
							method: 'GET',
						}),
					),
				),
			).resolves.toEqual([])
		} finally {
			await user.dispose()
		}
	})
})
