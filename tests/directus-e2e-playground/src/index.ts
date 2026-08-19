import { defineHook } from '@directus/extensions-sdk'
import { isRecord, isString } from '@onderwijsin/directus-extension-utils'
import {
	ensureDirectusSchema,
	ensureDirectusPolicy,
	createDirectusStartupCoordinator,
	getDirectusStartupStatus,
	validateSchemaDefinition,
	type DirectusSchemaDefinition,
} from '@onderwijsin/directus-extension-utils/server'

import { runUtilitySmokeTest } from './smoke'

export default defineHook(({ action }, context) => {
	if (context) {
		const { database, getSchema, logger, services } = context
		const policyDefinition = {
			id: '00000000-0000-4000-8000-000000000001',
			name: 'E2E playground policy',
			icon: 'policy',
			description: null,
			enforce_tfa: false,
			ip_access: null,
			app_access: false,
			admin_access: false,
			permissions: [],
		}
		const schemaDefinition: DirectusSchemaDefinition = {
			collections: [
				{
					collection: 'e2e_schema_management',
					schema: { name: 'e2e_schema_management' },
					fields: [
						{
							collection: 'e2e_schema_management',
							field: 'id',
							type: 'uuid',
							schema: { is_primary_key: true },
						},
					],
				},
			],
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

		const startup = createDirectusStartupCoordinator(action, logger, {
			id: 'e2e-playground',
			name: 'E2E playground',
			disabled: false,
			disabledGlobally: false,
			dataDisabledGlobally: false,
		})
		startup.schema(async ({ lockProvider }) => {
			const statusWhileHeld = await getDirectusStartupStatus({
				id: 'e2e-playground',
				options: { lockProvider },
			})
			const first = await ensureDirectusSchema({
				id: 'e2e-playground',
				database,
				getSchema,
				logger,
				definition: validateSchemaDefinition(schemaDefinition),
				services,
				options: { lockProvider },
			})
			const second = await ensureDirectusSchema({
				id: 'e2e-playground',
				database,
				getSchema,
				logger,
				definition: validateSchemaDefinition(schemaDefinition),
				services,
				options: { lockProvider },
			})
			const incompatible = await ensureDirectusSchema({
				id: 'e2e-playground-incompatible',
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
				msg: '🧪 E2E Directus startup scenarios completed',
				first,
				second,
				incompatible,
				statusWhileHeld,
			})
		})
		startup.data(async ({ lockProvider }) => {
			const first = await ensureDirectusPolicy({
				id: 'e2e-playground',
				database,
				getSchema,
				logger,
				services,
				definition: policyDefinition,
				options: { lockProvider },
			})
			const second = await ensureDirectusPolicy({
				id: 'e2e-playground',
				database,
				getSchema,
				logger,
				services,
				definition: policyDefinition,
				options: { lockProvider },
			})
			logger.info({
				msg: '🧪 E2E Directus data seed scenarios completed',
				first,
				second,
			})
		})
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
		const record = isRecord(meta) ? meta : {}
		if (record.collection === 'posts') void runUtilitySmokeTest(meta)
	})
	action('items.update', logItemEvent('updated'))
	action('items.delete', logItemEvent('deleted'))
})
