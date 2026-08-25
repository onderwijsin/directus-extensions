import { createHmac } from 'node:crypto'

import { createDirectusE2EClient } from '@workspace/test-utils'
import {
	createFlow,
	createOperation,
	createUser,
	customEndpoint,
	deleteUser,
	deleteFlow,
	deleteOperation,
	readItems,
	readUser,
	updateUser,
	updateFlow,
} from '@workspace/test-utils/commands'
import { describe, expect, it } from 'vitest'

import deletedContactPayload from './fixtures/contact-deleted.json'
import payload from './fixtures/testing-test-event.json'

const baseUrl = process.env.DIRECTUS_E2E_URL
const token = process.env.DIRECTUS_E2E_TOKEN
const composeFilesValue = process.env.DIRECTUS_E2E_COMPOSE_FILES
const composeProject = process.env.DIRECTUS_E2E_COMPOSE_PROJECT
const loopsMockPort = process.env.DIRECTUS_E2E_LOOPS_MOCK_PORT ?? '18086'

if (!baseUrl || !token || !composeFilesValue || !composeProject) {
	throw new Error('The Directus E2E environment was not initialized')
}

const composeFiles = JSON.parse(composeFilesValue)
if (!Array.isArray(composeFiles) || composeFiles.some((file) => typeof file !== 'string')) {
	throw new Error('The Directus E2E Compose file list is invalid')
}

const client = createDirectusE2EClient({ baseUrl, token, composeFiles, composeProject })
const signingSecret = 'directus-loops-e2e-secret'

const createSignature = (id: string, timestamp: string, body: string): string =>
	createHmac('sha256', signingSecret).update(`${id}.${timestamp}.${body}`).digest('base64')

const waitForProfileUpdate = async (userId: string): Promise<unknown> => {
	const deadline = Date.now() + 5_000
	while (Date.now() < deadline) {
		const updates = await loopsMockRequest('/mock/profile-updates')
		if (
			Array.isArray(updates) &&
			updates.some(
				(update) =>
					typeof update === 'object' &&
					update !== null &&
					'userId' in update &&
					update.userId === userId,
			)
		)
			return updates
		await new Promise((resolve) => setTimeout(resolve, 100))
	}
	return loopsMockRequest('/mock/profile-updates')
}

const loopsMockRequest = async (path: string, init: RequestInit = {}) => {
	const headers = new Headers(init.headers)
	headers.set('content-type', 'application/json')
	const response = await fetch(`http://127.0.0.1:${loopsMockPort}${path}`, {
		...init,
		headers,
	})
	const body: unknown = await response.json()
	if (!response.ok) throw new Error(`Loops mock ${response.status}: ${JSON.stringify(body)}`)
	return body
}

describe('Loops webhook Flow integration', () => {
	it('rejects invalid signatures and forwards verified webhook data to the operation', async () => {
		const flow = await client.request(
			createFlow({
				name: `Loops webhook E2E ${Date.now()}`,
				status: 'active',
				trigger: 'webhook',
				accountability: '$trigger',
				options: { method: 'POST', async: false, return: '$last' },
			}),
		)
		let operationId: string | undefined
		try {
			const operation = await client.request<{ id: string }>(
				createOperation({
					flow: flow.id,
					key: `loops_webhook_handler_${Date.now()}`,
					name: 'Loops webhook handler',
					type: 'loops-webhook-handler',
					position_x: 1,
					position_y: 1,
					options: {},
				}),
			)
			operationId = operation.id
			await client.request(updateFlow(flow.id, { operation: operation.id }))

			const webhookId = `e2e-${Date.now()}`
			const timestamp = String(Math.floor(Date.now() / 1_000))
			const body = JSON.stringify(payload)
			const endpoint = (headers: Record<string, string>) =>
				client.request(
					customEndpoint({
						path: `/flows/trigger/${flow.id}`,
						method: 'POST',
						headers: { 'Content-Type': 'application/json', ...headers },
						body,
					}),
				)

			await expect(
				endpoint({
					'webhook-id': webhookId,
					'webhook-timestamp': timestamp,
					'webhook-signature': 'v1,invalid',
				}),
			).rejects.toBeDefined()

			await expect(
				endpoint({
					'webhook-id': webhookId,
					'webhook-timestamp': timestamp,
					'webhook-signature': `v1,${createSignature(webhookId, timestamp, body)}`,
				}),
			).resolves.toMatchObject({
				verified: true,
				webhookId,
				ignored: true,
				eventName: 'testing.testEvent',
			})
		} finally {
			if (operationId)
				await client.request(deleteOperation(operationId)).catch(() => undefined)
			await client.request(deleteFlow(flow.id)).catch(() => undefined)
		}
	})

	it('disables synchronization when Loops deletes a contact linked to a Directus user', async () => {
		const user = await client.request(
			createUser({
				email: `loops-deleted-${Date.now()}@example.com`,
				password: `unused-${Date.now()}`,
				status: 'active',
				// @ts-expect-error -- the shared E2E schema does not include this extension-owned field.
				loops_sync_enabled: true,
			}),
		)
		const flow = await client.request(
			createFlow({
				name: `Loops contact deletion E2E ${Date.now()}`,
				status: 'active',
				trigger: 'webhook',
				accountability: '$trigger',
				options: { method: 'POST', async: false, return: '$last' },
			}),
		)
		let operationId: string | undefined
		try {
			const operation = await client.request<{ id: string }>(
				createOperation({
					flow: flow.id,
					key: `loops_contact_deleted_${Date.now()}`,
					name: 'Loops contact deleted',
					type: 'loops-webhook-handler',
					position_x: 1,
					position_y: 1,
					options: {},
				}),
			)
			operationId = operation.id
			await client.request(updateFlow(flow.id, { operation: operation.id }))

			const webhookId = `contact-deleted-e2e-${Date.now()}`
			const timestamp = String(Math.floor(Date.now() / 1_000))
			const body = JSON.stringify({
				...deletedContactPayload,
				contactIdentity: { ...deletedContactPayload.contactIdentity, userId: user.id },
			})
			const result = await client.request<{ directusUserId: string; updated: boolean }>(
				customEndpoint({
					path: `/flows/trigger/${flow.id}`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'webhook-id': webhookId,
						'webhook-timestamp': timestamp,
						'webhook-signature': `v1,${createSignature(webhookId, timestamp, body)}`,
					},
					body,
				}),
			)

			expect(result).toMatchObject({ directusUserId: user.id, updated: true })
			expect(
				await client.request(
					readUser(user.id, {
						// @ts-expect-error -- the shared E2E schema does not include this extension-owned field.
						fields: ['loops_sync_enabled'],
					}),
				),
			).toMatchObject({
				loops_sync_enabled: false,
			})
		} finally {
			if (operationId)
				await client.request(deleteOperation(operationId)).catch(() => undefined)
			await client.request(deleteFlow(flow.id)).catch(() => undefined)
			await client.request(deleteUser(user.id)).catch(() => undefined)
		}
	})

	it('persists a mocked Loops campaign and recipient', async () => {
		await loopsMockRequest('/mock/reset', { method: 'POST' })
		const flow = await client.request(
			createFlow({
				name: `Loops ingestion E2E ${Date.now()}`,
				status: 'active',
				trigger: 'webhook',
				accountability: '$trigger',
				options: { method: 'POST', async: false, return: '$last' },
			}),
		)
		let operationId: string | undefined
		try {
			const operation = await client.request<{ id: string }>(
				createOperation({
					flow: flow.id,
					key: `loops_ingestion_${Date.now()}`,
					name: 'Loops ingestion',
					type: 'loops-webhook-handler',
					position_x: 1,
					position_y: 1,
					options: {},
				}),
			)
			operationId = operation.id
			await client.request(updateFlow(flow.id, { operation: operation.id }))

			const webhookId = `ingestion-e2e-${Date.now()}`
			const timestamp = String(Math.floor(Date.now() / 1_000))
			const body = JSON.stringify({
				eventName: 'campaign.email.sent',
				eventTime: Number(timestamp),
				webhookSchemaVersion: '1.0.0',
				contactIdentity: {
					id: `contact-${Date.now()}`,
					email: `loops-ingestion-${Date.now()}@example.com`,
					userId: null,
				},
				campaignId: 'cm4t1suns001uw6atri87v54s',
				campaignName: 'Test Campaign',
				email: {
					id: `email-${Date.now()}`,
					emailMessageId: 'cm4t1suns001ww6atotin3bn1',
					subject: 'E2E subject',
				},
			})
			const signature = createSignature(webhookId, timestamp, body)
			const result = await client.request<{ status: string; recipientId: string }>(
				customEndpoint({
					path: `/flows/trigger/${flow.id}`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'webhook-id': webhookId,
						'webhook-timestamp': timestamp,
						'webhook-signature': `v1,${signature}`,
					},
					body,
				}),
			)

			expect(result.status).toMatch(/^(success|partial)$/u)
			expect(result.recipientId).toBeTruthy()
			const archived = await client.request<{ loops_campaign_id: string }[]>(
				// @ts-expect-error -- the shared E2E schema does not include extension-owned collections.
				readItems('loops_campaigns', {
					filter: { loops_campaign_id: { _eq: 'cm4t1suns001uw6atri87v54s' } },
					fields: ['loops_campaign_id'],
				}),
			)
			expect(archived).toHaveLength(1)
		} finally {
			if (operationId)
				await client.request(deleteOperation(operationId)).catch(() => undefined)
			await client.request(deleteFlow(flow.id)).catch(() => undefined)
		}
	})

	it('synchronizes an opted-in Directus user profile to the mocked Loops API', async () => {
		await loopsMockRequest('/mock/reset', { method: 'POST' })
		const email = `loops-profile-${Date.now()}@example.com`
		let userId: string | undefined
		try {
			const user = await client.request(
				createUser({
					email,
					password: `unused-${Date.now()}`,
					status: 'active',
					first_name: 'Initial',
					last_name: 'Profile',
					// @ts-expect-error -- the shared E2E schema does not include this extension-owned field.
					loops_sync_enabled: true,
				}),
			)
			userId = user.id
			await client.request(
				updateUser(user.id, {
					first_name: 'Updated',
					// @ts-expect-error -- the shared E2E schema does not include this extension-owned field.
					loops_sync_enabled: true,
				}),
			)

			const updates = await waitForProfileUpdate(user.id)
			expect(updates).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						userId: user.id,
						firstName: 'Updated',
						lastName: 'Profile',
					}),
				]),
			)
		} finally {
			if (userId) await client.request(deleteUser(userId)).catch(() => undefined)
		}
	})
})
