import { defineHook } from '@directus/extensions-sdk'
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

import { runUtilitySmokeTest } from './smoke'

export default defineHook(({ action }) => {
	/**
	 * Creates a handler that logs one Directus item lifecycle event.
	 * @param event - Lifecycle event name.
	 * @returns The event handler.
	 */
	const logItemEvent =
		(event: string) =>
		(meta: unknown): void => {
			const record = isRecord(meta) ? meta : {}
			const collection = isString(record.collection) ? record.collection : 'unknown'
			const key =
				isString(record.key) || typeof record.key === 'number'
					? record.key
					: Array.isArray(record.keys)
						? record.keys.join(',')
						: 'unknown'

			console.log(
				`directus-e2e-playground: item-event ${JSON.stringify({ event, collection, key: String(key) })}`,
			)
		}

	action('items.create', (meta: unknown) => {
		logItemEvent('created')(meta)
		void runUtilitySmokeTest(meta)
	})
	action('items.update', logItemEvent('updated'))
	action('items.delete', logItemEvent('deleted'))
})
