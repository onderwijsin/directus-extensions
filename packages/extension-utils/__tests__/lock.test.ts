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
		expect(await provider.isLocked('item')).toBe(true)
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
		expect(await provider.isLocked('item')).toBe(false)
	})

	it('shares lock state across providers with the same provider ID', async () => {
		const firstProvider = createMemoryLockProvider({
			providerId: 'shared-provider-test',
			tokenFactory: () => 'first',
		})
		const secondProvider = createMemoryLockProvider({
			providerId: 'shared-provider-test',
			tokenFactory: () => 'second',
		})

		const lease = await firstProvider.tryAcquire('shared-provider-lock', { leaseMs: 50 })

		expect(await secondProvider.isLocked('shared-provider-lock')).toBe(true)
		expect(await secondProvider.tryAcquire('shared-provider-lock')).toBeNull()
		expect(await lease?.release()).toBe(true)
		expect(await secondProvider.isLocked('shared-provider-lock')).toBe(false)
	})

	it('isolates lock state across different provider IDs', async () => {
		const firstProvider = createMemoryLockProvider({ providerId: 'isolated-provider-a' })
		const secondProvider = createMemoryLockProvider({ providerId: 'isolated-provider-b' })

		const lease = await firstProvider.tryAcquire('isolated-provider-lock', { leaseMs: 50 })

		expect(await secondProvider.isLocked('isolated-provider-lock')).toBe(false)
		expect(await secondProvider.tryAcquire('isolated-provider-lock')).not.toBeNull()
		expect(await lease?.release()).toBe(true)
	})

	it('rejects blank provider IDs', () => {
		expect(() => createMemoryLockProvider({ providerId: '   ' })).toThrow(TypeError)
	})

	it('reclaims expired memory locks without allowing the old owner to release the replacement', async () => {
		let currentTime = 1000
		const provider = createMemoryLockProvider({
			now: () => currentTime,
			tokenFactory: vi.fn().mockReturnValueOnce('old').mockReturnValueOnce('new'),
		})
		const oldLease = await provider.tryAcquire('item', { leaseMs: 10 })
		currentTime = 1010
		expect(await provider.isLocked('item')).toBe(false)
		const newLease = await provider.tryAcquire('item', { leaseMs: 100 })

		expect(newLease?.token).toBe('new')
		expect(await oldLease?.release()).toBe(false)
		expect(await newLease?.renew()).toBe(true)
		expect(await newLease?.release()).toBe(true)
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
