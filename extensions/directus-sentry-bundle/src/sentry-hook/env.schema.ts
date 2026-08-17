import { deploymentEnvs } from '@onderwijsin/directus-extension-utils/constants'
import { z } from 'zod'

/**
 * Validates a Sentry browser loader script tag.
 *
 * @returns A Zod schema accepting valid Sentry loader script tags.
 */
export const sentryLoaderScriptSchema = z
	.string()
	.regex(
		/^<script\s+src="https:\/\/js-de\.sentry-cdn\.com\/[a-f0-9]{32}\.min\.js"\s+crossorigin="anonymous"\s*><\/script>$/u,
		'Must be a valid Sentry loader script',
	)

/**
 * Validates the environment variables for the Sentry integration.
 *
 * @returns A Zod schema accepting valid environment variables.
 */
export const envSchema = z.object({
	SENTRY_ENABLED: z.boolean().default(false),
	SENTRY_DSN: z.url().trim().optional(),
	SENTRY_LOADER_SCRIPT: sentryLoaderScriptSchema.optional(),
	SENTRY_RELEASE_PREFIX: z.string().trim().default('dev'),
	SOURCE_COMMIT: z.string().trim().default('unknown'),
	SENTRY_RELEASE: z.string().trim().optional(),
	DEPLOYMENT_ENV: z.enum(deploymentEnvs).default('development'),
})
