import { defineHook } from '@directus/extensions-sdk'
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'

export default defineHook(({ action }) => {
	/**
	 * Creates a Directus item event logger.
	 * @param event - Lifecycle event label to include in the log message.
	 * @returns A handler that logs the collection for the lifecycle event.
	 */
	const logItemEvent = (event: string) => {
		/**
		 * Logs a Directus item lifecycle event.
		 * @param meta - Directus event metadata.
		 * @returns Nothing.
		 */
		return (meta: unknown): void => {
			const record = isRecord(meta) ? meta : {}
			const collection = isString(record.collection) ? record.collection : 'unknown'
			const key =
				isString(record.key) || typeof record.key === 'number'
					? record.key
					: Array.isArray(record.keys)
						? record.keys.join(',')
						: 'unknown'

			console.log(
				`sample-hook: item-event ${JSON.stringify({ event, collection, key: String(key) })}`,
			)
		}
	}

	action('items.create', logItemEvent('created'))
	action('items.update', logItemEvent('updated'))
	action('items.delete', logItemEvent('deleted'))
})
