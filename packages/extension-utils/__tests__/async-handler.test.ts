import type { NextFunction, Request, Response } from 'express'

import { describe, expect, it, vi } from 'vitest'

import { asyncHandler } from '../src/server/async-handler'

const request = {} as Request
const response = {} as Response
const createNext = (): NextFunction => vi.fn((_error?: unknown): void => undefined)

describe('asyncHandler', () => {
	it('executes a successful asynchronous handler', async () => {
		const handler = vi.fn(async () => {
			await Promise.resolve()
		})
		const next = createNext()

		const result = asyncHandler(handler)(request, response, next)

		expect(result).toBeUndefined()
		await vi.waitFor(() => expect(handler).toHaveBeenCalledWith(request, response, next))
		expect(next).not.toHaveBeenCalled()
	})

	it('forwards rejected promises to next', async () => {
		const error = new Error('request failed')
		const next = createNext()

		asyncHandler(async () => {
			await Promise.resolve()
			throw error
		})(request, response, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledWith(error))
	})

	it('allows asynchronous middleware to call next explicitly', async () => {
		const next = createNext()

		asyncHandler(async (_request, _response, middlewareNext) => {
			await Promise.resolve()
			middlewareNext()
		})(request, response, next)

		await vi.waitFor(() => expect(next).toHaveBeenCalledOnce())
	})
})
