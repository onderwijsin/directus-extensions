import { describe, expect, it } from 'vitest'

import { createDirectusE2EClient } from '../../../packages/test-utils/src'

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

async function expectEvent(event: string) {
	await expect(
		client.waitForLog(
			new RegExp(`sample-hook: item-event .*"event":"${event}".*"collection":"posts"`),
		),
	).resolves.toBeDefined()
}

describe('sample hook against Directus', () => {
	it('logs create, update, and delete events for posts items', async () => {
		const created = await client.createItem<{ id: string | number }>('posts', {
			title: `e2e-${Date.now()}`,
		})

		await expectEvent('created')

		await client.updateItem('posts', created.id, { title: 'updated' })
		await expectEvent('updated')

		await client.deleteItem('posts', created.id)
		await expectEvent('deleted')
	})
})
