import { defineHook } from '@directus/extensions-sdk';
import { fieldSchema, relationSchema, collectionSchema, namespaceFieldSchema, settingsFieldSchema } from './schema';
import { preventInfiniteLoop, recursivelyGetRedirectIDsByDestination, validateRedirect } from './utils';
import { EventContext } from '@directus/types';
import { getPathString, getSluggernautSettings } from '../shared/utils'
const collection = 'redirects';

import { createOrUpdateCollection, createOrUpdateFieldsInCollection, disableSchemaChange } from 'utils';


export default defineHook(async (
	{ filter, action },
	hookContext
) => {

	const { services, emitter, logger, env } = hookContext;

	if (!disableSchemaChange('SLUGGERNAUT_DISABLE_SCHEMA_CHANGE', env)) {
		// /* STEP 1: Create redirect collection, fields and relations, or update existing ones with inproper config */
		await createOrUpdateCollection(
			collection, 
			{
				collectionSchema,
				fieldSchema,
				relationSchema
			},
			hookContext
		);

		// /* STEP 2: add namespace field to collections */
		await createOrUpdateFieldsInCollection('directus_collections', namespaceFieldSchema, hookContext);

		// /* STEP 3: add redirect config fields to directus_settings */
		await createOrUpdateFieldsInCollection('directus_settings', settingsFieldSchema, hookContext);
	}
	


	filter('redirects.items.create', async (payload, meta, eventContext) => {
		if ((!payload || typeof payload !== 'object') || (!(payload as Record<string, any>).origin && !(payload as Record<string, any>).destination)) return
		await validateRedirect(payload, meta, eventContext, hookContext);
	})

	filter('redirects.items.update', async (payload, meta, eventContext) => {
		if ((!payload || typeof payload !== 'object') || (!(payload as Record<string, any>).origin && !(payload as Record<string, any>).destination)) return
		await validateRedirect(payload, meta, eventContext, hookContext);
	})


	emitter.onAction('redirect.update', async (payload: RedirectUpdateEvent, eventContext: EventContext) => {
		const { type, oldValues, newValue } = payload;
		const { ItemsService } = services
		const items = new ItemsService(collection, {
			schema: eventContext.schema,
			knex: eventContext.database
		});

		// Get redirect config
		const { use_namespace, use_trailing_slash, namespace } = await getSluggernautSettings(payload.collection, eventContext, hookContext);
		const destination = type === 'path' ? newValue : getPathString(newValue, 'slug', { use_namespace, use_trailing_slash, namespace });
		
		// First prevent an infinite loop by deleting any redirects that have the new destination as their origin
		await preventInfiniteLoop(destination, collection, eventContext, hookContext);

		// Secondly, create the redirect(s)
		items.createMany(oldValues.map(oldValue => ({
			origin: type === 'path' ? oldValue : getPathString(oldValue, 'slug', { use_namespace, use_trailing_slash, namespace }),
			destination,
			type: 301,
			is_active: true
		}) as RedirectCreate))
	})


	emitter.onAction('redirect.delete', async (payload: RedirectDeleteEvent, eventContext: EventContext) => {
		const { values, type } = payload;
		const { use_namespace, use_trailing_slash, namespace } = await getSluggernautSettings(payload.collection,eventContext, hookContext);

		// Get an array of redirect IDs to delete that are assiociated with the deleted slugs
		const idsToDelete = await recursivelyGetRedirectIDsByDestination(
			type === 'path' ? values : values.map(val => getPathString(val, 'slug', { use_namespace, use_trailing_slash, namespace })), 
			collection, 
			eventContext,
			hookContext
		);

		const { ItemsService } = services
		const items = new ItemsService(collection, {
			schema: eventContext.schema,
			knex: eventContext.database
		});

		logger.info(`Deleting ${idsToDelete.length} redirects because they were associated with the deleted slugs`, {
			redirect_ids: idsToDelete,
			slugs: values
		});
		items.deleteMany(idsToDelete);
	})


	// If the redirect settings are updated, we need to update each item in the redirect collection
	action('settings.update', async (meta, eventContext) => {
		if (meta.payload.hasOwnProperty('use_trailing_slash')) {
			const { use_trailing_slash } = meta.payload
			const { ItemsService } = services
			const items = new ItemsService(collection, {
				schema: eventContext.schema,
				knex: eventContext.database
			});

			// There is no aggregation service to get the total number of redirects. So we'll need some custom logic here
			const limit = env.QUERY_LIMIT_MAX || 1000;

			let data: RedirectMutate[] = []
			let offset = 0;
			let redirects;

			// Keep fetching redirects that don't match the new condination, until lesser then limit
			do {
				redirects = await items.readByQuery({
					fields: ['id', 'origin', 'destination'],
					filter: {
						_or: [
							{ 
								origin: {
									[use_trailing_slash ? '_nends_with' : '_ends_with']: '/'
								}
							},
							{ 
								destination: {
									[use_trailing_slash ? '_nends_with' : '_ends_with']: '/'
								}
							},
						]
					},
					limit,
					offset
				});

				data = data.concat(redirects);
				offset += limit;
			} while (redirects.length === limit);

			// Modify the data to satisfy the new conditions
			data = data.map(item => ({
				id: item.id,
				origin: use_trailing_slash ? !item.origin.endsWith('/') ? item.origin + '/' : item.origin : item.origin.endsWith('/') ? item.origin.slice(0, -1) : item.origin,
				destination: use_trailing_slash ? !item.destination.endsWith('/') ? item.destination + '/' : item.destination : item.destination.endsWith('/') ? item.destination.slice(0, -1) : item.destination
			}))

			// Update in batches
			await items.updateBatch(data);

		}
	})

});


