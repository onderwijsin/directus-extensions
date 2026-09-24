import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ioredis', () => ({
	default: class RedisMock {
		public readonly url: string

		public constructor(url: string) {
			this.url = url
		}
	},
}))

import type { MagicLinksEnv } from '../src/magic-links-endpoint/env.schema'

import {
	createMagicLinksRedisClient,
	createRequestLimiter,
} from '../src/magic-links-endpoint/rate-limiter'

const options: MagicLinksEnv = {
	DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
	DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
	SYNCHRONIZATION_STORE: 'memory',
	REDIS_ENABLED: false,
	SECRET: 'directus-secret',
	MAGIC_LINKS_ENABLED: true,
	MAGIC_LINKS_COLLECTION: 'magic_links',
	MAGIC_LINKS_TOKEN_TTL: '15m',
	MAGIC_LINKS_REQUEST_RATE_LIMIT: 5,
	MAGIC_LINKS_REDIRECT_URL_ALLOWLIST: ['https://app.example.com/auth/magic-link'],
	MAGIC_LINKS_TOKEN_QUERY_PARAMETER: 'token',
	MAGIC_LINKS_EMAIL_TEMPLATE: 'magic-link',
	EMAIL_TRANSPORT: 'sendmail',
	EMAIL_VERIFY_SETUP: true,
	EMAIL_TEMPLATES_PATH: './templates',
	EMAIL_SENDMAIL_NEW_LINE: 'unix',
	EMAIL_SENDMAIL_PATH: '/usr/sbin/sendmail',
	EMAIL_MAILGUN_HOST: 'api.mailgun.net',
	EMAIL_FROM: 'no-reply@example.com',
}

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
		const configuredOptions = { ...options, MAGIC_LINKS_REQUEST_RATE_LIMIT: 1 }
		const limiter = createRequestLimiter({ options: configuredOptions })

		await expect(limiter.consume('203.0.113.11')).resolves.toBeUndefined()
		await expect(limiter.consume('203.0.113.11')).rejects.toThrow()
		vi.advanceTimersByTime(60_001)
		await expect(limiter.consume('203.0.113.11')).resolves.toBeUndefined()
	})

	it('creates a Redis client only for the Redis-backed store', () => {
		const localClient = createMagicLinksRedisClient(options)
		expect(localClient).toBeUndefined()

		const redisOptions: MagicLinksEnv = {
			...options,
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis',
			REDIS: 'redis://localhost',
		}
		const redis = createMagicLinksRedisClient(redisOptions)
		expect(redis).toBeDefined()
	})
})
