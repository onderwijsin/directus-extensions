import type { Logger } from 'pino'

export type { Logger } from 'pino'

/** Pino-like logger shape accepted by server utilities. */
export type LoggerLike = Pick<Logger, 'info' | 'warn' | 'error'> &
	Partial<Pick<Logger, 'debug' | 'trace'>>

/**
 * Returns the supplied logger or a console-backed logger with the shared contract.
 * @param logger - Optional runtime-provided Pino logger.
 * @returns A logger implementing the Directus runtime logger contract.
 */
export default function createLogger(logger?: LoggerLike): LoggerLike {
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

export { createLogger }
