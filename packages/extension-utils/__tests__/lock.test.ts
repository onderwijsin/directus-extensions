import { describe, expect, it, vi } from 'vitest'

import { createMemoryLockProvider } from '../src/server'

describe('lock utilities', () => {
	it('acquires, contends, renews, and releases memory locks by owner token', async () => {
		let currentTime = 1000
		let tokenNumber = 0
		const provider = createMemoryLockProvider({
			now: () => currentTime,
			tokenFactory: () => `token-${++tokenNumber}`,
		})

		const first = await provider.tryAcquire('  item  ', { leaseMs: 50 })
		expect(first?.name).toBe('item')
		expect(first?.token).toBe('token-1')
		expect(await provider.tryAcquire('item')).toBeNull()
		currentTime = 1025
		expect(await first?.renew()).toBe(true)
		currentTime = 1074
		expect(await provider.tryAcquire('item')).toBeNull()
		currentTime = 1075
		const second = await provider.tryAcquire('item')
		expect(second?.token).toBe('token-2')
		expect(await first?.release()).toBe(false)
		expect(await second?.release()).toBe(true)
	})

	it('reclaims expired memory locks without allowing the old owner to release the replacement', async () => {
		let currentTime = 1000
		const provider = createMemoryLockProvider({
			now: () => currentTime,
			tokenFactory: vi.fn().mockReturnValueOnce('old').mockReturnValueOnce('new'),
		})
		const oldLease = await provider.tryAcquire('item', { leaseMs: 10 })
		currentTime = 1010
		const newLease = await provider.tryAcquire('item', { leaseMs: 100 })

		expect(newLease?.token).toBe('new')
		expect(await oldLease?.release()).toBe(false)
		expect(await newLease?.renew()).toBe(true)
	})

	it('rejects invalid memory lock names and lease durations', async () => {
		const provider = createMemoryLockProvider()

		await expect(provider.tryAcquire('   ')).rejects.toThrow(TypeError)
		await expect(provider.tryAcquire('item', { leaseMs: 0 })).rejects.toThrow(RangeError)
		await expect(provider.tryAcquire('item', { leaseMs: Number.NaN })).rejects.toThrow(
			RangeError,
		)
	})

	it('uses the configured default lease when an acquire call omits one', async () => {
		let currentTime = 1000
		const provider = createMemoryLockProvider({
			now: () => currentTime,
			defaultLeaseMs: 10,
		})

		const lease = await provider.tryAcquire('item')
		currentTime = 1010
		expect(await lease?.renew()).toBe(false)
	})

	it('propagates memory clock and token failures', async () => {
		const clockFailure = new Error('clock unavailable')
		const clockProvider = createMemoryLockProvider({
			now: () => {
				throw clockFailure
			},
		})
		await expect(clockProvider.tryAcquire('item')).rejects.toBe(clockFailure)

		const tokenFailure = new Error('token unavailable')
		const tokenProvider = createMemoryLockProvider({
			tokenFactory: () => {
				throw tokenFailure
			},
		})
		await expect(tokenProvider.tryAcquire('item')).rejects.toBe(tokenFailure)

		let currentTime = 1000
		const provider = createMemoryLockProvider({
			now: () => currentTime,
			tokenFactory: () => 'token',
		})
		const lease = await provider.tryAcquire('item', { leaseMs: 10 })
		currentTime = 1010
		await expect(lease?.renew()).resolves.toBe(false)
		await expect(lease?.release()).resolves.toBe(false)
	})
})
