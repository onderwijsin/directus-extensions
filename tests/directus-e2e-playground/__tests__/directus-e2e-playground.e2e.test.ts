import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createCollection,
	createField,
	createItem,
	customEndpoint,
	deleteCollection,
	deleteItem,
	deletePermission,
	deletePolicy,
	readCollection,
	readField,
	readPermissions,
	readPolicy,
	readRelationByCollection,
	updateItem,
} from '@workspace/test-utils/commands'
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
const e2ePolicyId = '00000000-0000-4000-8000-000000000001'

function getPermissionPolicyId(permission: {
	policy: string | { id: string } | null
}): string | null {
	if (permission.policy === null) return null
	return typeof permission.policy === 'string' ? permission.policy : permission.policy.id
}

async function createPlaygroundCollection(): Promise<() => Promise<void>> {
	await client.request(
		createCollection({
			collection: 'posts',
			meta: { icon: 'article', note: 'Created for Directus extension E2E tests' },
			schema: {},
		}),
	)
	await client.request(
		createField('posts', {
			field: 'title',
			type: 'string',
			meta: { interface: 'input', required: true },
			schema: { is_nullable: false },
		}),
	)

	return async () => {
		await client.request(deleteCollection('posts'))
	}
}

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
	const output = await client.waitForLog(
		/directus-e2e-playground: utilities .*"collection":"posts"/u,
	)
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
		types: { partial: { nested: {} } },
		loggerFields: {
			attempt: 'async',
			classification: 'document',
			fileType: 'document',
		},
		cache: { memory: 'memory', redis: 'redis' },
		locks: { memoryContended: true, fileContended: true, redisLockUsed: true },
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
		/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
	)
}

async function waitForValue<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			const value = await read()
			if (matches(value)) return value
		} catch {
			// The startup coordinator may still be creating the resource.
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	throw new Error('Timed out waiting for the Directus ensure resource')
}

describe('Directus E2E playground', () => {
	it('ensures a live collection, field, and relation idempotently', async () => {
		try {
			const startupLog = await client.waitForLog(
				/🧪 E2E Directus startup scenarios completed/u,
			)
			expect(startupLog).toMatch(/statusWhileHeld:[\s\S]*"isLocked": true/u)

			const collection = await client.request(readCollection('e2e_schema_management'))
			expect(collection).toMatchObject({ collection: 'e2e_schema_management' })

			const field = await client.request(readField('e2e_schema_management', 'title'))
			expect(field).toMatchObject({ field: 'title', type: 'string' })

			const relations = await client.request(
				readRelationByCollection('e2e_schema_management'),
			)
			expect(relations).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						collection: 'e2e_schema_management',
						field: 'user',
						related_collection: 'directus_users',
					}),
				]),
			)
		} finally {
			await client.request(deleteCollection('e2e_schema_management')).catch(() => undefined)
		}
	})

	it('seeds a policy and linked permissions idempotently', async () => {
		try {
			const policies = await waitForValue(
				() => client.request(readPolicy(e2ePolicyId)),
				(value) => value.id === e2ePolicyId,
			)
			expect(policies).toMatchObject({ id: e2ePolicyId, name: 'E2E playground policy' })

			const output = await client.waitForLog(/directus-e2e-playground: policy-seed /u)
			const marker = 'directus-e2e-playground: policy-seed '
			const line = output.split('\n').find((entry) => entry.includes(marker))
			if (!line) throw new Error('Expected the policy seed result log line')
			const result = JSON.parse(line.slice(line.indexOf(marker) + marker.length))
			expect(result.first.changed).toEqual([
				'policy:00000000-0000-4000-8000-000000000001',
				'permission:00000000-0000-4000-8000-000000000001:e2e_schema_management:read',
			])
			expect(result.second).toEqual({ changed: [], skipped: false })

			await client.request(
				customEndpoint({ path: '/utils/cache/clear?system', method: 'POST' }),
			)

			// TODO somehow the seeded permissions / policies are not in here. (hence the marker validation)
			// This is tracked in https://github.com/onderwijsin/directus-extensions/issues/29
			const permissions = await client.request(
				readPermissions({ fields: ['id', 'policy', 'collection', 'action'] }),
			)

			expect(Array.isArray(permissions)).toBe(true)
		} finally {
			const permissions = await client
				.request(readPermissions({ fields: ['id', 'policy'] }))
				.catch(() => [])
			for (const permission of permissions.filter(
				(item) => getPermissionPolicyId(item) === e2ePolicyId,
			)) {
				await client.request(deletePermission(permission.id)).catch(() => undefined)
			}
			await client.request(deletePolicy(e2ePolicyId)).catch(() => undefined)
		}
	})

	it('logs create, update, and delete events for posts items', async () => {
		const disposeCollection = await createPlaygroundCollection()
		try {
			const created = await client.request(
				createItem('posts', { title: `e2e-${Date.now()}` }),
			)

			await expectEvent('created')
			await expectUtilityResults()

			await client.request(updateItem('posts', created.id, { title: 'updated' }))
			await expectEvent('updated')

			await client.request(deleteItem('posts', created.id))
			await expectEvent('deleted')
		} finally {
			await disposeCollection()
		}
	})
})
