import { createDirectusE2EClient } from '@workspace/test-utils'
import { expect, it } from 'vitest'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT
const pocSecret = process.env.POC_SECRET

if (!baseUrl || !token || !composeFilesValue || !composeProject || !pocSecret) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })

it('loads consumer TypeScript configuration from the packed extension', async () => {
	const output = await client.waitForLog(/directus-configuration-poc: configuration loaded/u)

	expect(output).not.toContain(pocSecret)
})
