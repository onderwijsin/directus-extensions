import type { HookConfig } from './types'

import { defineHook as defineDirectusHook } from '@directus/extensions-sdk'

export type {
	ActionHandler,
	HookConfig,
	InitHandler,
	MaybePromise,
	RegisterFunctions,
} from './types'

/**
 * Defines a Directus hook using corrected extension register function types.
 *
 * This only changes compile-time typing. The runtime implementation remains
 * Directus's native `defineHook`.
 *
 * @param config - Hook configuration.
 * @returns The supplied hook configuration.
 */
export function defineHook(config: HookConfig): HookConfig {
	return defineDirectusHook(config)
}
