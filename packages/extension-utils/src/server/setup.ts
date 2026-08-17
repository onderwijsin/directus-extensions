import type { Logger } from 'pino'

import { z, type ZodType } from 'zod'

/**
 * Setup observability helpers for extension entrypoints
 * @param EXTENSION_NAME - The name of the extension that is set up
 * @param env - Environment Variables
 * @param log - Pino Logger
 * @returns An object containing start, end, and isEnabled functions
 */
export function extensionSetup<ENV extends Record<string, unknown>>(
	EXTENSION_NAME: string,
	env: ENV,
	log: Logger,
) {
	/**
	 * Logs an extension startup state
	 * @returns void
	 */
	const start = () => log.info(`🔌 Loading extension ${EXTENSION_NAME}`)
	/**
	 * Logs a successful extension setup
	 * @returns void
	 */
	const end = () => log.info(`✅ Extension ${EXTENSION_NAME} Loaded`)

	const isEnabledEnv = `${EXTENSION_NAME.toUpperCase()}_ENABLED`

	/**
	 * Checks whether an extension is disabled via environment variables.
	 * @returns a boolean indicating whether the extension is enabled
	 */
	const isEnabled = (): boolean => {
		if (env[isEnabledEnv] === false || env[isEnabledEnv] === 'false') {
			log.info(
				`⛔️ Extension ${EXTENSION_NAME} is disabled via its "${isEnabledEnv}" environment variable. Skipping setup...`,
			)
			return false
		}
		return true
	}

	return { start, end, isEnabled }
}

/**
 * Validates extension environment config against a Zod schema.
 * @param options - The extension environment.
 * @param schema - The complete extension-specific Zod schema, including `<EXTENSION_NAME_ENABLED>`.
 * @param log - The Pino Logger
 * @returns The validated options.
 * @throws When validation fails.
 */
export function validateExtensionOptions<S extends ZodType>(
	options: unknown,
	schema: S,
	log: Logger,
): z.output<S> {
	const result = schema.safeParse(options)

	if (result.success) {
		return result.data
	}

	log.info(z.prettifyError(result.error))
	throw new Error('Invalid extension options ☝. Exiting.')
}
