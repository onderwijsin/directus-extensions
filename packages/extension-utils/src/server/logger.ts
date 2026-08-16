/** Minimal structured logger contract shared across Directus runtimes. */
export interface Logger {
	trace?(message: string, fields?: Record<string, unknown>): void
	debug?(message: string, fields?: Record<string, unknown>): void
	info(message: string, fields?: Record<string, unknown>): void
	warn(message: string, fields?: Record<string, unknown>): void
	error(message: string, fields?: Record<string, unknown>): void
}

/** A logger with optional methods, suitable for adapting runtime-provided loggers. */
export type LoggerLike = Partial<Logger>

/**
 * Returns the supplied logger or a console-backed logger with the shared contract.
 * @param logger - Optional runtime-provided logger.
 * @returns A logger implementing the Directus runtime logger contract.
 */
export function createLogger(logger?: LoggerLike): Logger {
	return {
		trace: (message, fields) => {
			if (logger?.trace) logger.trace(message, fields)
			else console.trace(message, fields)
		},
		debug: (message, fields) => {
			if (logger?.debug) logger.debug(message, fields)
			else console.debug(message, fields)
		},
		info: (message, fields) => {
			if (logger?.info) logger.info(message, fields)
			else console.info(message, fields)
		},
		warn: (message, fields) => {
			if (logger?.warn) logger.warn(message, fields)
			else console.warn(message, fields)
		},
		error: (message, fields) => {
			if (logger?.error) logger.error(message, fields)
			else console.error(message, fields)
		},
	}
}
