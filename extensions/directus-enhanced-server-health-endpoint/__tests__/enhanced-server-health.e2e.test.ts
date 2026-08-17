import { createDirectusE2EClient } from '@workspace/test-utils'
import { customEndpoint } from '@workspace/test-utils/commands'
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

describe('enhanced server health endpoint', () => {
	it('returns a cache-disabled health response through Directus', async () => {
		await expect(
			client.request(customEndpoint({ path: '/server/health/enhanced', method: 'GET' })),
		).resolves.toEqual({ status: 'ok' })
	})
})
