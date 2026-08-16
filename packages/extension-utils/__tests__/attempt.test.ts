import { afterEach, describe, expect, it, vi } from 'vitest'

import { attempt, attemptSync, attemptWithRetry } from '../src/index'

describe('attempt utilities', () => {
	afterEach(() => vi.useRealTimers())

	it('returns successful synchronous and asynchronous values', async () => {
		expect(attemptSync(() => 42)).toEqual({ data: 42, error: null })
		expect(await attempt(() => Promise.resolve('value'))).toEqual({
			data: 'value',
			error: null,
		})
		expect(await attempt(() => Promise.resolve('async value'))).toEqual({
			data: 'async value',
			error: null,
		})
	})

	it('captures thrown and rejected values without normalizing them', async () => {
		const syncError = new Error('SYNC_FAILURE')
		const asyncError = new Error('ASYNC_FAILURE')

		expect(
			attemptSync(() => {
				throw syncError
			}),
		).toEqual({ data: null, error: syncError })
		expect(await attempt(() => Promise.reject(asyncError))).toEqual({
			data: null,
			error: asyncError,
		})
	})

	it('retries up to the total attempt count and returns the first success', async () => {
		let calls = 0
		const result = await attemptWithRetry(
			() => {
				calls += 1
				if (calls < 3) throw new Error(`failure ${calls}`)
				return 'success'
			},
			{ attempts: 3, delayMs: 0 },
		)

		expect(result).toEqual({ data: 'success', error: null })
		expect(calls).toBe(3)
	})

	it('returns the final error after exhausting attempts', async () => {
		const error = new Error('failure')
		let calls = 0
		const result = await attemptWithRetry(
			() => {
				calls += 1
				throw error
			},
			{ attempts: 2, delayMs: 0 },
		)

		expect(result).toEqual({ data: null, error })
		expect(calls).toBe(2)
	})

	it('does not retry after a successful first attempt', async () => {
		const operation = vi.fn(() => 'success')

		expect(await attemptWithRetry(operation, { attempts: 5, delayMs: 100 })).toEqual({
			data: 'success',
			error: null,
		})
		expect(operation).toHaveBeenCalledOnce()
	})

	it('executes exactly once when the attempt limit is one', async () => {
		const error = new Error('single attempt failure')
		const operation = vi.fn(() => {
			throw error
		})

		expect(await attemptWithRetry(operation, { attempts: 1, delayMs: 0 })).toEqual({
			data: null,
			error: error,
		})
		expect(operation).toHaveBeenCalledOnce()
	})

	it('waits with exponential backoff between retries', async () => {
		vi.useFakeTimers()
		const operation = vi.fn(() => Promise.reject(new Error('temporary failure')))
		const resultPromise = attemptWithRetry(operation, {
			attempts: 3,
			delayMs: 10,
			exponentialBackoff: true,
		})

		await vi.runAllTimersAsync()
		const result = await resultPromise

		expect(result.error).toBeInstanceOf(Error)
		expect(operation).toHaveBeenCalledTimes(3)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('supports a constant retry delay', async () => {
		vi.useFakeTimers()
		const operation = vi.fn(() => Promise.reject(new Error('temporary failure')))
		const resultPromise = attemptWithRetry(operation, {
			attempts: 4,
			delayMs: 10,
			exponentialBackoff: false,
		})

		await vi.runAllTimersAsync()
		await resultPromise

		expect(operation).toHaveBeenCalledTimes(4)
		expect(vi.getTimerCount()).toBe(0)
	})

	it('rejects invalid retry bounds before executing the operation', async () => {
		const operation = vi.fn()

		await expect(attemptWithRetry(operation, { attempts: 0 })).rejects.toThrow(
			'Attempt attempts must be a positive safe integer',
		)
		await expect(attemptWithRetry(operation, { attempts: 1.5 })).rejects.toThrow(
			'Attempt attempts must be a positive safe integer',
		)
		await expect(attemptWithRetry(operation, { delayMs: -1 })).rejects.toThrow(
			'Attempt delayMs must be a finite non-negative number',
		)
		await expect(attemptWithRetry(operation, { delayMs: Number.NaN })).rejects.toThrow(
			'Attempt delayMs must be a finite non-negative number',
		)
		expect(operation).not.toHaveBeenCalled()
	})
})
