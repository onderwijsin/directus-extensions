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
			new RegExp(
				`directus-e2e-playground: item-event .*"event":"${event}".*"collection":"posts"`,
			),
		),
	).resolves.toBeDefined()
}

async function expectUtilityResults() {
	const output = await client.waitForLog(/directus-e2e-playground: utilities /u)
	const marker = 'directus-e2e-playground: utilities '
	const utilityLine = output.split('\n').find((line) => line.includes(marker))
	if (!utilityLine) throw new Error('Expected the utility result log line')
	const payload = JSON.parse(utilityLine.slice(utilityLine.indexOf(marker) + marker.length))

	expect(payload).toMatchObject({
		attempts: { async: 'async', sync: 'sync', retry: 'retried', calls: 2 },
		guards: {
			array: true,
			audio: true,
			boolean: true,
			defined: true,
			document: true,
			finite: true,
			function: true,
			hasKey: true,
			hasKeys: true,
			image: true,
			integer: true,
			number: true,
			nonBlank: true,
			nonEmpty: true,
			record: true,
			string: true,
			video: true,
		},
		object: {
			entries: [
				['collection', 'posts'],
				['retry', 'retried'],
			],
			keys: ['collection', 'retry'],
			rebuilt: { collection: 'posts', retry: 'retried' },
		},
		types: { point: { type: 'Point', coordinates: [4.9, 52.3] }, partial: { nested: {} } },
		loggerFields: {
			attempt: 'async',
			classification: 'document',
			fileType: 'document',
		},
		cache: { memory: 'memory', redis: 'redis' },
		locks: { memoryContended: true, fileContended: true, redisContended: true },
		autoTask: {
			runs: 1,
			fileMarkerGeneration: 2,
			fileMarkerCleared: true,
			redisMarkerGeneration: 1,
			redisMarkerCleared: true,
		},
	})
	expect(payload.loggerFields.deterministicUuid).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
	)
	expect(payload.loggerFields.uuid).toMatch(
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
	)
}

describe('Directus E2E playground', () => {
	it('logs create, update, and delete events for posts items', async () => {
		const created = await client.createItem<{ id: string | number }>('posts', {
			title: `e2e-${Date.now()}`,
		})

		await expectEvent('created')
		await expectUtilityResults()

		await client.updateItem('posts', created.id, { title: 'updated' })
		await expectEvent('updated')

		await client.deleteItem('posts', created.id)
		await expectEvent('deleted')
	})
})
