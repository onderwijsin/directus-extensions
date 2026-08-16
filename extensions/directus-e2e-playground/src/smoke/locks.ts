import { uuid } from '@onderwijsin/directus-extension-utils'
import {
	createMemoryLockProvider,
	createFsLockProvider,
	createRedisLockProvider,
} from '@onderwijsin/directus-extension-utils/server'

/**
 * Runs process-local, filesystem, and Directus-compatible Redis lock checks.
 * @param redisUrl - Redis connection URL used by the distributed provider.
 * @returns The observed lock results.
 */
export const runLockSmokeTest = async (redisUrl: string) => {
	const memory = createMemoryLockProvider({ tokenFactory: () => 'memory-token' })
	const memoryLease = await memory.tryAcquire('item', { leaseMs: 1000 })
	const memoryContended = await memory.tryAcquire('item')
	await memoryLease?.release()

	const file = createFsLockProvider({
		directory: `/tmp/directus-e2e-playground-locks-${uuid()}`,
		tokenFactory: (() => {
			let sequence = 0
			return () => `file-token-${++sequence}`
		})(),
	})
	const fileLease = await file.tryAcquire('item', { leaseMs: 1000 })
	const fileContended = await file.tryAcquire('item')
	await fileLease?.release()

	const distributed = createRedisLockProvider({
		redisUrl,
		namespace: 'extension-utils:e2e:lock',
		defaultLeaseMs: 1000,
	})
	const redisLease = await distributed.tryAcquire('item', { leaseMs: 1000 })
	const redisLockUsed = redisLease !== null
	await redisLease?.release()
	await distributed.dispose()

	return {
		memoryContended: memoryContended === null,
		fileContended: fileContended === null,
		redisLockUsed,
	}
}
