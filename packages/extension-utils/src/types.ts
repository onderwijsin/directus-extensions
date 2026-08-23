import type {
	EventContext,
	HookExtensionContext,
	RegisterFunctions as DirectusRegisterFunctions,
} from '@directus/types'

/**
 * Value that may be returned synchronously or asynchronously.
 */
export type MaybePromise<T> = T | Promise<T>

/**
 * Handler for a Directus action hook.
 *
 * Directus ignores the resolved return value, but action handlers may be
 * asynchronous.
 */
export type ActionHandler<T = void> = (
	// oxlint-disable-next-line typescript/no-explicit-any -- Directus does not expose a safer action metadata type.
	meta: Record<string, any>,
	context: EventContext,
) => MaybePromise<T>

/**
 * Corrected Directus register functions.
 *
 * Replaces Directus's `action` handler type so asynchronous action handlers
 * retain their actual return type.
 */
export type RegisterFunctions = Omit<DirectusRegisterFunctions, 'action'> & {
	action: <T = void>(event: string, handler: ActionHandler<T>) => void
}

/**
 * Hook configuration using the corrected extension register function types.
 */
export type HookConfig = (register: RegisterFunctions, context: HookExtensionContext) => void
