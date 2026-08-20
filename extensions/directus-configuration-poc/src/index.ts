import type { ApiExtensionContext } from '@directus/types'
import type { Jiti, JitiOptions } from 'jiti'

import { createRequire } from 'node:module'

import { defineHook } from '@directus/extensions-sdk'
import {
	attempt,
	attemptSync,
	hasKey,
	isRecord,
	isNonBlankString,
} from '@onderwijsin/directus-extension-utils'
import { createJiti } from 'jiti'
import { z } from 'zod'

const configurationSchema = z.object({ value: z.string() }).strict()
const CONFIGURATION_PATH = 'CONFIGURATION_PATH'

/**
 * Loads and validates the consumer-owned configuration synchronously.
 * Uses the CommonJs approach via `createRequire` and `jiti`.
 *
 * Jiti marks this feature as deprecated. It recommends using the async import with
 * ESM compatibility
 *
 * @see https://github.com/unjs/jiti#programmatic
 *
 * @param configurationPath - Absolute or runtime-resolvable configuration path.
 * @param context - Directus extension context
 * @returns Validated configuration.
 */
function loadConfigurationSync(
	configurationPath: string,
	context: ApiExtensionContext,
): z.infer<typeof configurationSchema> {
	const { data: loaded, error: loadError } = attemptSync(() => {
		const require = createRequire(import.meta.url)
		const jitiModule = require('jiti') as {
			createJiti: (id: string, userOptions?: JitiOptions) => Jiti
		}
		const jiti = jitiModule.createJiti(import.meta.url)
		const configModule = jiti(configurationPath)

		if (!configModule || !isRecord(configModule) || !hasKey(configModule, 'default')) {
			throw new Error(`Could not load configuration at ${configurationPath}`)
		}
		return configModule.default
	})
	if (loadError) {
		throw new Error(
			`directus-configuration-poc: failed to load configuration at ${configurationPath}`,
			{ cause: loadError },
		)
	}

	const { data, error, success } = configurationSchema.safeParse(loaded)

	if (!success) {
		context.logger.warn(z.prettifyError(error))
		throw new Error(
			`directus-configuration-poc: failed to validate configuration at ${configurationPath}. See validation error above.`,
		)
	}

	return data
}

/**
 * Loads and validates the consumer-owned configuration asynchronously.
 * Uses the async import with ESM compatibility.
 *
 * @see https://github.com/unjs/jiti#programmatic
 *
 * @param configurationPath - Absolute or runtime-resolvable configuration path.
 * @param context - Directus extension context
 * @returns a promise that resolves to the validated configuration.
 */
async function loadConfigurationAsync(
	configurationPath: string,
	context: ApiExtensionContext,
): Promise<z.infer<typeof configurationSchema>> {
	const { data: loaded, error: loadError } = await attempt(async () => {
		const jiti = createJiti(import.meta.url)
		const configModule = await jiti.import(configurationPath, { default: true })
		if (!configModule || !isRecord(configModule)) {
			throw new Error(`Could not load configuration at ${configurationPath}`)
		}
		return configModule
	})
	if (loadError) {
		throw new Error(
			`directus-configuration-poc: failed to load configuration at ${configurationPath}`,
			{ cause: loadError },
		)
	}

	const { data, error, success } = configurationSchema.safeParse(loaded)

	if (!success) {
		context.logger.warn(z.prettifyError(error))
		throw new Error(
			`directus-configuration-poc: failed to validate configuration at ${configurationPath}. See validation error above.`,
		)
	}

	return data
}

export default defineHook((hook, context) => {
	const configurationPath = context.env[CONFIGURATION_PATH]
	if (!isNonBlankString(configurationPath)) {
		throw new Error(
			`directus-configuration-poc: ${CONFIGURATION_PATH} is required and must be a non-empty path`,
		)
	}

	context.logger.info('directus-configuration-poc: loading sync configuration...')
	const syncConfig = loadConfigurationSync(configurationPath, context)
	context.logger.info({ syncConfig })

	/**
	 * Action handler are incorrectly typed as () => void, even though Directus awaits these callbacks.
	 * Therefore an async handler in fine to use - it just results in an anoying oxlint error.
	 *
	 * @example
	 * ```ts
	 * type FilterHandler<T = unknown> = (payload: T, meta: Record<string, any>, context: EventContext) => T | Promise<T>;
	 * type ActionHandler = (meta: Record<string, any>, context: EventContext) => void;
	 * ```
	 */
	// oxlint-disable-next-line typescript/no-misused-promises -- Directus awaits async action handlers despite typing them as void-returning.
	hook.action('server.start', async () => {
		context.logger.info('directus-configuration-poc: loading configuration asynchronously...')
		const asyncConfig = await loadConfigurationAsync(configurationPath, context)
		context.logger.info({ asyncConfig })
	})

	context.logger.info('✅ directus-configuration-poc: configuration loaded')
})
