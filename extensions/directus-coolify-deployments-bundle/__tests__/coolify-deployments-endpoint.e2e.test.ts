import { describe, expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN

if (!baseUrl || !token) {
	throw new Error('DIRECTUS_E2E_URL and DIRECTUS_E2E_TOKEN are required for endpoint E2E tests')
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
})
