import type { NextFunction, Request, Response } from 'express'
import type { RequestWithRawBody } from './types'

import { InternalServerError, InvalidPayloadError } from '@directus/errors'
import { isArray } from '@onderwijsin/directus-extension-utils'
import { verifyLoopsWebhookSignature } from '@onderwijsin/loops-core'

import { LOOPS_WEBHOOK_ID_HEADER, LOOPS_WEBHOOK_VERIFIED_HEADER } from '../shared/constants'
import { InvalidWebhookSignature } from './errors'

/**
 * Reads one header value from Node's normalized header representation.
 * @param request - Express Request object
 * @param name - Header name.
 * @returns First header value when present.
 */
const getHeader = (request: Request, name: string): string | undefined => {
	const value = request.headers[name]
	return isArray(value) ? value[0] : value
}

/**
 * Creates middleware that verifies Loops requests before Directus parses them.
 *
 * Requests without Loops webhook headers are passed through untouched so other webhook Flows
 * continue to work. Verified requests receive an internal marker that Directus forwards into the
 * Flow trigger data chain.
 *
 * @param signingSecret - Loops webhook signing secret.
 * @param timestampToleranceSeconds - Maximum accepted signature age.
 * @returns Express middleware for the Directus webhook Flow route family.
 */
export const createLoopsWebhookMiddleware =
	(signingSecret: string | undefined, timestampToleranceSeconds: number) =>
	async (request: RequestWithRawBody, _response: Response, next: NextFunction): Promise<void> => {
		const id = getHeader(request, 'webhook-id')
		const timestamp = getHeader(request, 'webhook-timestamp')
		const signature = getHeader(request, 'webhook-signature')
		const hasLoopsHeaders = Boolean(id ?? timestamp ?? signature)

		// This is fine. If the Loops webhook is requested without any Loops headers, we simply pass it through,
		// and let the operation decline due to missing verification header
		if (!hasLoopsHeaders) {
			request.headers[LOOPS_WEBHOOK_VERIFIED_HEADER] = 'false'
			next()
			return
		}

		if (!id || !timestamp || !signature) {
			next(new InvalidPayloadError({ reason: 'Missing required Loops webhook headers' }))
			return
		}

		if (!signingSecret) {
			next(new InternalServerError())
			return
		}

		const { rawBody } = request
		if (!rawBody) {
			next(new InvalidPayloadError({ reason: 'Unable to read Loops webhook body' }))
			return
		}

		const rawBodyText = rawBody.toString('utf8')

		const isValid = await verifyLoopsWebhookSignature(
			rawBodyText,
			{ id, timestamp, signature },
			signingSecret,
			{ timestampToleranceSeconds },
		)

		if (!isValid) {
			next(new InvalidWebhookSignature())
			return
		}

		try {
			request.body = JSON.parse(rawBodyText)
		} catch {
			next(new InvalidPayloadError({ reason: 'Invalid Loops webhook JSON' }))
			return
		}

		request.headers[LOOPS_WEBHOOK_VERIFIED_HEADER] = 'true'
		request.headers[LOOPS_WEBHOOK_ID_HEADER] = id
		next()
	}
