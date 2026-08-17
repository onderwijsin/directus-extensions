import type { Logger } from 'pino'

/**
 * Returns the supplied logger or a console-backed logger with the shared contract.
 * @param logger - Optional runtime-provided Pino logger.
 * @returns A logger implementing the Directus runtime logger contract.
 */
export default function (logger?: Logger) {
	return (
		logger ??
		({
			info: console.log,
			warn: console.warn,
			error: console.error,
			debug: console.debug,
			trace: console.trace,
		} as Logger)
	)
}
