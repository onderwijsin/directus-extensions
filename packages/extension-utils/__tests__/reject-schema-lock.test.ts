import { describe, expect, it, vi } from 'vitest'

import {
	rejectWhileSchemaLocked,
	SchemaLockedError,
	SchemaStatusError,
	type LockProvider,
} from '../src/server'

const createProvider = (isLocked: () => Promise<boolean>): LockProvider => ({
	tryAcquire: vi.fn(),
	isLocked,
})

describe('rejectWhileSchemaLocked', () => {
	it('continues when the startup lock is not held', async () => {
		const next = vi.fn()
		const result = await rejectWhileSchemaLocked(
			{
				id: 'orders',
				options: { lockProvider: createProvider(() => Promise.resolve(false)) },
			},
			next,
		)

		expect(result).toBe(false)
		expect(next).not.toHaveBeenCalled()
	})

	it('forwards the locked error when startup is in progress', async () => {
		const next = vi.fn()
		const result = await rejectWhileSchemaLocked(
			{
				id: 'orders',
				options: { lockProvider: createProvider(() => Promise.resolve(true)) },
			},
			next,
		)

		expect(result).toBe(true)
		expect(next).toHaveBeenCalledWith(expect.any(SchemaLockedError))
	})

	it('forwards a status error when the lock status cannot be read', async () => {
		const next = vi.fn()
		const result = await rejectWhileSchemaLocked(
			{
				id: 'orders',
				options: {
					lockProvider: createProvider(() => Promise.reject(new Error('unavailable'))),
				},
			},
			next,
		)

		expect(result).toBe(true)
		expect(next).toHaveBeenCalledWith(expect.any(SchemaStatusError))
	})
})
