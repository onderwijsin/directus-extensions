import type { PrimaryKey } from '@directus/types'

import { AsyncLocalStorage } from 'node:async_hooks'

interface RecalculationScope {
	collection: string
	key: PrimaryKey
	fields: ReadonlySet<string>
}

const recalculationScope = new AsyncLocalStorage<RecalculationScope>()

/**
 * Carries an operation's exact field selection through its item-service update filter.
 * @param scope - Collection, item key, and selected fields for this write.
 * @param callback - Awaited item-service write.
 * @returns The callback result.
 */
export function withRecalculationScope<T>(scope: RecalculationScope, callback: () => T): T {
	return recalculationScope.run({ ...scope, fields: new Set(scope.fields) }, callback)
}

/**
 * Reads the selection only for the item currently being recalculated.
 * @param collection - Collection undergoing an update.
 * @param key - Updated item key.
 * @returns Selected fields, or undefined for ordinary and unrelated updates.
 */
export function recalculationFields(
	collection: string,
	key: PrimaryKey,
): ReadonlySet<string> | undefined {
	const scope = recalculationScope.getStore()
	return scope?.collection === collection && scope.key === key ? scope.fields : undefined
}
