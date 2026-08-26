import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ioredis', () => ({
	default: class RedisMock {
		public readonly url: string

		public constructor(url: string) {
			this.url = url
		}
	},
}))

import { envSchema } from '../src/magic-links-endpoint/env.schema'
import {
	createMagicLinksRedisClient,
	createRequestLimiter,
} from '../src/magic-links-endpoint/rate-limiter'

const options = envSchema.parse({
	SECRET: 'directus-secret',
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
	EMAIL_TRANSPORT: 'sendmail',
})

describe('magic-link request limiter', () => {
	afterEach(() => vi.useRealTimers())

	it('uses five requests per minute by default', async () => {
		const limiter = createRequestLimiter({ options })

		for (let attempt = 0; attempt < 5; attempt++) {
			await expect(limiter.consume('203.0.113.10')).resolves.toBeUndefined()
		}
		await expect(limiter.consume('203.0.113.10')).rejects.toThrow()
	})

	it('resets the request budget after one minute', async () => {
		vi.useFakeTimers()
		const configuredOptions = envSchema.parse({
			SECRET: 'directus-secret',
			MAGIC_LINKS_REQUEST_RATE_LIMIT: 1,
			MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
			EMAIL_TRANSPORT: 'sendmail',
		})
		const limiter = createRequestLimiter({ options: configuredOptions })

		await expect(limiter.consume('203.0.113.11')).resolves.toBeUndefined()
		await expect(limiter.consume('203.0.113.11')).rejects.toThrow()
		vi.advanceTimersByTime(60_001)
		await expect(limiter.consume('203.0.113.11')).resolves.toBeUndefined()
	})

	it('creates a Redis client only for the Redis-backed store', () => {
		const localClient = createMagicLinksRedisClient(options)
		expect(localClient).toBeUndefined()

		const redisOptions = envSchema.parse({
			SECRET: 'directus-secret',
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis',
			REDIS: 'redis://localhost',
			MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
			EMAIL_TRANSPORT: 'sendmail',
		})
		const redis = createMagicLinksRedisClient(redisOptions)
		expect(redis).toBeDefined()
	})
})
