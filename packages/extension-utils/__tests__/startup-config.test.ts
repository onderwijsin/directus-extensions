import { describe, expect, it } from 'vitest'

import {
	directusStartupSchema,
	resolveExtensionRateLimiterStore,
	resolveStartupLockProvider,
} from '../src/server/directus-ensure/config'

describe('directusStartupSchema', () => {
	it('provides the documented defaults', () => {
		expect(directusStartupSchema.parse({})).toEqual({
			DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: true,
			DIRECTUS_EXTENSIONS_DATA_SEED_ENABLED: true,
			SYNCHRONIZATION_STORE: 'memory',
			REDIS_ENABLED: false,
		})
	})

	it('accepts explicit global schema settings', () => {
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_SCHEMA_CHANGES_ENABLED: false,
			}).success,
		).toBe(true)
	})

	it('requires backend configuration for distributed providers', () => {
		expect(
			directusStartupSchema.safeParse({ DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' }).success,
		).toBe(false)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis',
				DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: 'redis://localhost:6379',
			}).success,
		).toBe(true)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'fs',
				DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: '/tmp/directus-locks',
			}).success,
		).toBe(true)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis',
				REDIS: 'redis://localhost:6379',
			}).success,
		).toBe(true)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis',
				DIRECTUS_EXTENSIONS_LOCK_REDIS_URL: 'http://localhost:6379',
			}).success,
		).toBe(false)
	})

	it('requires the Directus Redis connection for the distributed rate limiter', () => {
		expect(
			directusStartupSchema.safeParse({ DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis' })
				.success,
		).toBe(false)
		expect(
			directusStartupSchema.safeParse({
				DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis',
				REDIS: 'redis://localhost:6379',
			}).success,
		).toBe(true)
	})

	it('accepts component-based Redis configuration for startup coordination', () => {
		const options = {
			REDIS_ENABLED: true,
			REDIS_HOST: 'cache.example',
			REDIS_PORT: 6379,
			REDIS_USERNAME: 'default',
			REDIS_PASSWORD: 'secret',
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'redis' as const,
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'redis' as const,
		}
		expect(directusStartupSchema.safeParse(options).success).toBe(true)
		expect(
			directusStartupSchema.safeParse({ ...options, REDIS_PASSWORD: undefined }).success,
		).toBe(false)
	})

	it('falls back to synchronization storage and gives local settings precedence', () => {
		const globalRedis = directusStartupSchema.parse({
			SYNCHRONIZATION_STORE: 'redis',
			REDIS: 'redis://localhost:6379',
		})
		expect(resolveStartupLockProvider(globalRedis)).toBe('redis')
		expect(resolveExtensionRateLimiterStore(globalRedis)).toBe('redis')

		const localMemory = directusStartupSchema.parse({
			...globalRedis,
			DIRECTUS_EXTENSIONS_LOCK_PROVIDER: 'fs',
			DIRECTUS_EXTENSIONS_LOCK_FS_DIRECTORY: '/tmp/directus-locks',
			DIRECTUS_EXTENSIONS_RATE_LIMITER_STORE: 'memory',
		})
		expect(resolveStartupLockProvider(localMemory)).toBe('fs')
		expect(resolveExtensionRateLimiterStore(localMemory)).toBe('memory')
	})
})
