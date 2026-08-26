import type { Limiter } from '@directus/memory'
import type { ApiExtensionContext } from '@directus/types'
import type { MagicLinksEnv } from './env.schema'

import { InternalServerError } from '@directus/errors'
import { createLimiter } from '@directus/memory'
import {
	resolveExtensionRateLimiterStore,
	resolveRedisConnectionString,
} from '@onderwijsin/directus-extension-utils/server'
import Redis from 'ioredis'

import { parseDuration } from './helpers'

interface CreateLimiterInput {
	options: MagicLinksEnv
	redis?: Redis
}

interface CreateRedeemLimiterInput extends CreateLimiterInput {
	context: ApiExtensionContext
}

const REQUEST_REDIS_NAMESPACE = 'directus:extensions:magic-links:request'
const REDEEM_REDIS_NAMESPACE = 'directus:extensions:magic-links:redeem'

/**
 * Creates the shared Redis connection used by the endpoint's limiter instances.
 * @param options - Validated extension configuration.
 * @returns A Redis connection for the configured store, or `undefined` for local storage.
 */
export function createMagicLinksRedisClient(options: MagicLinksEnv): Redis | undefined {
	if (resolveExtensionRateLimiterStore(options) !== 'redis') return undefined

	const redisUrl = resolveRedisConnectionString(options, options.SYNCHRONIZATION_STORE)
	if (!redisUrl) throw new InternalServerError()
	return new Redis(redisUrl)
}

/**
 * Creates a limiter using either the shared Redis connection or process-local memory.
 * @param input - Limiter store, namespace, duration, and point configuration.
 * @returns The configured limiter instance.
 */
const createConfiguredLimiter = (
	input: CreateLimiterInput & {
		namespace: string
		duration: number
		points: number
	},
): Limiter => {
	const { redis, namespace, duration, points } = input
	if (redis) {
		return createLimiter({
			type: 'redis',
			namespace,
			redis,
			duration,
			points,
		})
	}

	return createLimiter({ type: 'local', duration, points })
}

/**
 * Creates the request limiter for the public magic-link request endpoint.
 * @param input - Validated extension configuration and optional shared Redis connection.
 * @returns The request limiter.
 */
export function createRequestLimiter(input: CreateLimiterInput): Limiter {
	return createConfiguredLimiter({
		...input,
		namespace: REQUEST_REDIS_NAMESPACE,
		duration: 60,
		points: input.options.MAGIC_LINKS_REQUEST_RATE_LIMIT,
	})
}

/**
 * Creates the failed-OTP limiter configured for the current Directus project.
 * @param input - Database and validated extension configuration.
 * @returns A project-local or Redis-backed limiter, or `null` when disabled.
 */
export async function createRedeemLimiter(
	input: CreateRedeemLimiterInput,
): Promise<Limiter | null> {
	const settingsService = new input.context.services.SettingsService({
		knex: input.context.database,
		schema: await input.context.getSchema(),
	})
	const settings = await settingsService.readSingleton({
		fields: ['auth_login_attempts'],
	})

	if (settings?.auth_login_attempts === null || settings?.auth_login_attempts === undefined) {
		return null
	}

	const duration = Math.max(
		1,
		Math.ceil(parseDuration(input.options.MAGIC_LINKS_TOKEN_TTL) / 1000),
	)
	const points = settings.auth_login_attempts

	return createConfiguredLimiter({
		...input,
		namespace: REDEEM_REDIS_NAMESPACE,
		duration,
		points,
	})
}
