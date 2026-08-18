import { defineHook } from '@directus/extensions-sdk'
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'
import {
	ensureDirectusSchema,
	registerSchemaChangeOnStart,
	type DirectusSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import { runUtilitySmokeTest } from './smoke'

export default defineHook(({ action }, context) => {
	if (context) {
		const { database, getSchema, logger, services } = context
		const schemaDefinition: DirectusSchemaDefinition = {
			collections: [{ collection: 'e2e_schema_management', schema: {} }],
			fields: [
				{
					collection: 'e2e_schema_management',
					field: 'title',
					type: 'string',
				},
				{
					collection: 'e2e_schema_management',
					field: 'user',
					type: 'uuid',
				},
			],
			relations: [
				{
					collection: 'e2e_schema_management',
					field: 'user',
					related_collection: 'directus_users',
				},
			],
		}

		registerSchemaChangeOnStart(
			action,
			logger,
			async () => {
				const first = await ensureDirectusSchema({
					extensionId: 'e2e-playground',
					database,
					getSchema,
					logger,
					definition: schemaDefinition,
					services,
					options: {},
				})
				const second = await ensureDirectusSchema({
					extensionId: 'e2e-playground',
					database,
					getSchema,
					logger,
					definition: schemaDefinition,
					services,
					options: {},
				})
				const incompatible = await ensureDirectusSchema({
					extensionId: 'e2e-playground-incompatible',
					database,
					getSchema,
					logger,
					definition: {
						...schemaDefinition,
						fields: [
							{
								collection: 'e2e_schema_management',
								field: 'title',
								type: 'integer',
							},
						],
					},
					services,
					options: { abortOnError: false },
				})
				logger.info({
					msg: '🧪 E2E schema-management scenarios completed',
					first,
					second,
					incompatible,
				})
				return incompatible
			},
			{
				name: 'E2E playground',
				disabled: false,
				disabledGlobally: false,
			},
		)
	}

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
