import type { LoggerLike } from '../logger'
import type { EnsureDirectusSchemaResult } from './ensure'

/** Minimal action registration contract used by server extensions. */
export type ActionRegistrar = (event: 'server.start', handler: () => void) => void

/** Options controlling startup schema-change registration. */
export interface RegisterSchemaChangeOnStartOptions {
	name: string
	disabled: boolean
	disabledGlobally: boolean
}

/**
 * Registers an asynchronous schema ensure operation on Directus server startup.
 * @param action - Directus action registrar.
 * @param logger - Logger used for disabled and failure messages.
 * @param callback - Schema ensure operation to invoke after startup.
 * @param options - Extension and global enablement state.
 * @returns Nothing.
 */
export function registerSchemaChangeOnStart(
	action: ActionRegistrar,
	logger: LoggerLike,
	callback: () => Promise<EnsureDirectusSchemaResult>,
	options: RegisterSchemaChangeOnStartOptions,
): void {
	const { name, disabled, disabledGlobally } = options
	action('server.start', () => {
		if (disabledGlobally) {
			logger.info(name + ' schema changes are disabled globally')
			return
		}
		if (disabled) {
			logger.info(name + ' schema changes are disabled for this extension')
			return
		}

		void callback().catch((error: unknown) => {
			logger.error(name + ' schema setup failed', { cause: error })
		})
	})
}
