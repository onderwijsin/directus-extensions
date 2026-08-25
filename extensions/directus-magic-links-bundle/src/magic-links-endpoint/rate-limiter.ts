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

type Database = ApiExtensionContext['database']
type Services = ApiExtensionContext['services']
type GetSchema = ApiExtensionContext['getSchema']

interface CreateMagicLinkLimiterInput {
	database: Database
	getSchema: GetSchema
	services: Services
	options: MagicLinksEnv
}

const REDIS_NAMESPACE = 'directus:extensions:magic-links'

/**
 * Creates the failed-OTP limiter configured for the current Directus project.
 * @param input - Database and validated extension configuration.
 * @returns A project-local or Redis-backed limiter, or `null` when disabled.
 */
export async function createMagicLinkLimiter(
	input: CreateMagicLinkLimiterInput,
): Promise<Limiter | null> {
	const settingsService = new input.services.SettingsService({
		knex: input.database,
		schema: await input.getSchema(),
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

	if (resolveExtensionRateLimiterStore(input.options) === 'redis') {
		const redisUrl = resolveRedisConnectionString(
			input.options,
			input.options.SYNCHRONIZATION_STORE,
		)
		if (!redisUrl) throw new InternalServerError()
		return createLimiter({
			type: 'redis',
			namespace: REDIS_NAMESPACE,
			redis: new Redis(redisUrl),
			duration,
			points,
		})
	}

	return createLimiter({ type: 'local', duration, points })
}
