import { describe, expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL

if (!baseUrl) throw new Error('The Directus E2E environment was not initialized')

describe('enhanced server health endpoint', () => {
	it('returns a cache-disabled health response through Directus', async () => {
		const response = await fetch(`${baseUrl}/server/health/enhanced`)
		const body = await response.json()

		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toContain('no-store')
		expect(response.headers.get('pragma')).toBe('no-cache')
		expect(body).toEqual({ status: 'ok' })
	})
})
