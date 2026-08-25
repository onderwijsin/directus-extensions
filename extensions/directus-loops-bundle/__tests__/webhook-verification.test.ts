import type { RequestWithRawBody } from '../src/loops-webhook-hook/types'

import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import { InvalidWebhookSignature } from '../src/loops-webhook-hook/errors'
import { createLoopsWebhookMiddleware } from '../src/loops-webhook-hook/verification'
import { LOOPS_WEBHOOK_ID_HEADER, LOOPS_WEBHOOK_VERIFIED_HEADER } from '../src/shared/constants'
import payload from './fixtures/campaign-email-sent.json'

const signingSecret = `whsec_${Buffer.from('directus-loops-test-secret').toString('base64')}`
const rawBody = JSON.stringify(payload)
const webhookId = 'msg_test_123'
const timestamp = String(Math.floor(Date.now() / 1_000))

const signature = createHmac('sha256', Buffer.from('directus-loops-test-secret'))
	.update(`${webhookId}.${timestamp}.${rawBody}`)
	.digest('base64')

const createRequest = (headers: Record<string, string>, body: string) => {
	const request = Readable.from([Buffer.from(body)]) as unknown as RequestWithRawBody
	request.headers = headers
	request.rawBody = Buffer.from(body)
	return request
}

const createResponse = () => ({
	status: vi.fn().mockReturnThis(),
	json: vi.fn(),
})

describe('Loops webhook verification middleware', () => {
	it('verifies the raw body and forwards the verification signal', async () => {
		const request = createRequest(
			{
				'webhook-id': webhookId,
				'webhook-timestamp': timestamp,
				'webhook-signature': `v1,${signature}`,
			},
			rawBody,
		)
		const response = createResponse()
		const next = vi.fn()

		// @ts-expect-error -- this EventEmitter is a minimal request test double.
		await createLoopsWebhookMiddleware(signingSecret, 300)(request, response, next)

		expect(next).toHaveBeenCalledOnce()
		expect(response.status).not.toHaveBeenCalled()
		expect(request.body).toEqual(payload)
		expect(request.headers[LOOPS_WEBHOOK_VERIFIED_HEADER]).toBe('true')
		expect(request.headers[LOOPS_WEBHOOK_ID_HEADER]).toBe(webhookId)
		expect(request.headers['x-loops-webhook-raw-body']).toBeUndefined()
	})

	it('rejects a tampered body without invoking the Flow', async () => {
		const request = createRequest(
			{
				'webhook-id': webhookId,
				'webhook-timestamp': timestamp,
				'webhook-signature': `v1,${signature}`,
			},
			rawBody.replace('Test Subject', 'Tampered Subject'),
		)
		const response = createResponse()
		const next = vi.fn()

		// @ts-expect-error -- this EventEmitter is a minimal request test double.
		await createLoopsWebhookMiddleware(signingSecret, 300)(request, response, next)

		expect(next).toHaveBeenCalledOnce()
		expect(next).toHaveBeenCalledWith(expect.any(InvalidWebhookSignature))
		expect(response.status).not.toHaveBeenCalled()
	})

	it('rejects signatures outside the configured timestamp tolerance', async () => {
		const expiredTimestamp = String(Math.floor(Date.now() / 1_000) - 301)
		const expiredSignature = createHmac('sha256', Buffer.from('directus-loops-test-secret'))
			.update(`${webhookId}.${expiredTimestamp}.${rawBody}`)
			.digest('base64')
		const request = createRequest(
			{
				'webhook-id': webhookId,
				'webhook-timestamp': expiredTimestamp,
				'webhook-signature': `v1,${expiredSignature}`,
			},
			rawBody,
		)
		const response = createResponse()
		const next = vi.fn()

		// @ts-expect-error -- this EventEmitter is a minimal request test double.
		await createLoopsWebhookMiddleware(signingSecret, 300)(request, response, next)

		expect(next).toHaveBeenCalledOnce()
		expect(next).toHaveBeenCalledWith(expect.any(InvalidWebhookSignature))
		expect(response.status).not.toHaveBeenCalled()
	})

	it('passes unrelated webhook Flows through untouched', async () => {
		const request = createRequest({}, rawBody)
		const response = createResponse()
		const next = vi.fn()

		// @ts-expect-error -- this EventEmitter is a minimal request test double.
		await createLoopsWebhookMiddleware(signingSecret, 300)(request, response, next)

		expect(next).toHaveBeenCalledOnce()
		expect(request.body).toBeUndefined()
		expect(response.status).not.toHaveBeenCalled()
	})
})
