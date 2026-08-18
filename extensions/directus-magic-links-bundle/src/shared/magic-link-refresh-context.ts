import type { PrimaryKey } from '@directus/types'

import { AsyncLocalStorage } from 'node:async_hooks'

export interface MagicLinkRefreshContext {
	userId: PrimaryKey
}

const refreshContext = new AsyncLocalStorage<MagicLinkRefreshContext>()

/**
 * Runs an authentication refresh with magic-link provenance attached to its async context.
 * @param userId - Directus user associated with the refresh.
 * @param callback - Refresh operation to execute within the context.
 * @returns The callback result.
 */
export const runAsMagicLinkRefresh = <T>(userId: PrimaryKey, callback: () => T): T =>
	refreshContext.run({ userId }, callback)

/**
 * Reads the magic-link provenance for the current async execution context.
 * @returns The current context, or undefined for unrelated operations.
 */
export const getMagicLinkRefreshContext = (): MagicLinkRefreshContext | undefined =>
	refreshContext.getStore()
