import { describe, expect, it, vi } from 'vitest'

import {
	createMemoryLockProvider,
	createRedisLockProvider,
	type RedisLockClient,
} from '../src/index.js'

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

	it('uses Redis NX acquisition and token-checked renew/release scripts', async () => {
		const values = new Map<string, string>()
		const set = vi.fn((key: string, value: string, ...arguments_: unknown[]) => {
			if (values.has(key)) return Promise.resolve(null)
			expect(arguments_[0]).toBe('PX')
			expect(arguments_[2]).toBe('NX')
			values.set(key, value)
			return Promise.resolve('OK')
		})
		const evalScript = vi.fn(
			(script: string, _numberOfKeys: number, key: string, token: string) => {
				if (values.get(key) !== token) return Promise.resolve(0)
				if (script.includes('pexpire')) return Promise.resolve(1)
				values.delete(key)
				return Promise.resolve(1)
			},
		)
		const client: RedisLockClient = {
			set,
			eval: evalScript,
		}
		const provider = createRedisLockProvider(client, {
			keyPrefix: 'test:',
			tokenFactory: vi
				.fn()
				.mockReturnValueOnce('first')
				.mockReturnValueOnce('contender')
				.mockReturnValueOnce('second'),
		})

		const first = await provider.tryAcquire('item', { leaseMs: 100 })
		expect(first?.token).toBe('first')
		expect(await provider.tryAcquire('item')).toBeNull()
		expect(await first?.renew()).toBe(true)
		expect(await first?.release()).toBe(true)
		expect(await first?.release()).toBe(false)
		const second = await provider.tryAcquire('item')
		expect(second?.token).toBe('second')
		expect(set).toHaveBeenCalledWith('test:item', 'first', 'PX', 100, 'NX')
		expect(evalScript).toHaveBeenCalledTimes(2)
	})

	it('does not release a Redis replacement and propagates client failures', async () => {
		const values = new Map<string, string>()
		const client: RedisLockClient = {
			set: async (key, value) => {
				if (values.has(key)) return null
				values.set(key, value)
				return 'OK'
			},
			eval: async (_script, _numberOfKeys, key, token) => {
				if (values.get(String(key)) !== String(token)) return 0
				return 1
			},
		}
		const provider = createRedisLockProvider(client, {
			tokenFactory: vi.fn().mockReturnValueOnce('old').mockReturnValueOnce('new'),
		})
		const oldLease = await provider.tryAcquire('item', { leaseMs: 10 })
		values.set('extension-utils:lock:item', 'new')

		expect(await oldLease?.release()).toBe(false)
		expect(values.get('extension-utils:lock:item')).toBe('new')

		const failure = new Error('redis unavailable')
		const failingProvider = createRedisLockProvider({
			set: () => Promise.reject(failure),
			eval: () => Promise.reject(failure),
		})
		await expect(failingProvider.tryAcquire('item')).rejects.toBe(failure)
	})

	it('treats non-success Redis SET replies as contention', async () => {
		const provider = createRedisLockProvider({
			set: async () => undefined,
			eval: async () => 1,
		})

		expect(await provider.tryAcquire('item')).toBeNull()
	})

	it('propagates Redis renewal and release failures while allowing release retry', async () => {
		let evaluationCount = 0
		const failure = new Error('redis eval unavailable')
		const provider = createRedisLockProvider({
			set: async () => 'OK',
			eval: async () => {
				evaluationCount += 1
				if (evaluationCount < 3) throw failure
				return 1
			},
		})
		const lease = await provider.tryAcquire('item')

		await expect(lease?.renew()).rejects.toBe(failure)
		await expect(lease?.release()).rejects.toBe(failure)
		await expect(lease?.release()).resolves.toBe(true)
	})
})
