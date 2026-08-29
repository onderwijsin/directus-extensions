import type { Accountability } from '@directus/types'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

import { getAccountabilityFromRequest } from './accountability'

/**
 * An asynchronous Express request handler.
 */
export type AsyncRequestHandler = (
	request: Request & { accountability: Accountability | null },
	response: Response,
	next: NextFunction,
) => Promise<void>

/**
 * Wraps an asynchronous request handler for use with Express 4.
 *
 * Rejected promises are forwarded to Express through `next`.
 *
 * @param handler - Asynchronous request handler.
 * @returns An Express-compatible synchronous request handler.
 */
export function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
	return (request, response, next): void => {
		const accountableRequest = Object.assign(request, {
			accountability: getAccountabilityFromRequest(request),
		})

		void handler(accountableRequest, response, next).catch(next)
	}
}
