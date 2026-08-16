import type Redis from 'ioredis'

import { createKv } from '@directus/memory'
import { createMemoryLockProvider, generateUUID } from '@onderwijsin/directus-extension-utils'
import { createFileLockProvider } from '@onderwijsin/directus-extension-utils/server'

/**
 * Runs process-local, filesystem, and Directus-compatible Redis lock checks.
 * @param redis - Connected Redis client shared by the smoke groups.
 * @returns The observed lock results.
 */
export const runLockSmokeTest = async (redis: Redis) => {
	const memory = createMemoryLockProvider({ tokenFactory: () => 'memory-token' })
	const memoryLease = await memory.tryAcquire('item', { leaseMs: 1000 })
	const memoryContended = await memory.tryAcquire('item')
	await memoryLease?.release()

	const file = createFileLockProvider({
		directory: `/tmp/directus-e2e-playground-locks-${generateUUID()}`,
		tokenFactory: (() => {
			let sequence = 0
			return () => `file-token-${++sequence}`
		})(),
	})
	const fileLease = await file.tryAcquire('item', { leaseMs: 1000 })
	const fileContended = await file.tryAcquire('item')
	await fileLease?.release()

	const distributed = createKv({
		type: 'redis',
		namespace: 'extension-utils:e2e:lock',
		redis,
		lockTimeout: 1000,
	})
	let redisLockUsed = false
	await distributed.usingLock('item', () => {
		redisLockUsed = true
		return Promise.resolve()
	})

	return {
		memoryContended: memoryContended === null,
		fileContended: fileContended === null,
		redisLockUsed,
	}
}
