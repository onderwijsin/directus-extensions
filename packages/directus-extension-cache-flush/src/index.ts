import { EventContext } from '@directus/types';
import { defineHook } from '@directus/extensions-sdk';

import { createOrUpdateCollection, createOrUpdateRelationsInCollection, disableSchemaChange } from 'utils';
import { 
	collectionSchema, collectionFieldSchema, collectionRelationSchema,
	junctionSchema, junctionFieldSchema, junctionRelationSchema 
} from './schema';

import { fetchCacheFlushConfig, fetchExistingFieldData } from './utils';
import type { EventKey, MetaCreate, MetaUpdate, MetaDelete, FlushConfig, RecordData } from './types';
import { sendFlushRequest } from './flush';


export default defineHook(async ({ filter, action }, hookContext) => {
	
	if (!disableSchemaChange('CACHE_FLUSH_DISABLE_SCHEMA_CHANGE', hookContext.env)) {
		// Create the collections for storing flush config
		await createOrUpdateCollection(
			collectionSchema.collection, 
			{
				collectionSchema, fieldSchema: collectionFieldSchema
			},
			hookContext
		);

		// Create junction between Directus users and cache_flush_targets
		await createOrUpdateCollection(
			junctionSchema.collection, 
			{
				collectionSchema: junctionSchema, fieldSchema: junctionFieldSchema
			},
			hookContext
		);

		// We need to create the junction relation after the junction collection is created
		await createOrUpdateRelationsInCollection("cache_flush_targets", collectionRelationSchema, hookContext);
		await createOrUpdateRelationsInCollection("cache_flush_targets_directus_users", junctionRelationSchema, hookContext);
	}
	
	(["items.create", "items.update"] as const).forEach(event => {
		action(event, async (meta, eventContext) => {
			const config = await fetchCacheFlushConfig(hookContext);
			const currentEvent = event.split('.')[1] as EventKey
			// check if current collection exists in flush settings
			// Skip if current mutation does not satisfy the schema
			if (!config.filter(target => target.schema && target.schema.find(c => c.collection === meta.collection && c.events.includes(currentEvent))).length) return; 

			for (const target of config) {
				await sendFlushRequest(meta as MetaCreate | MetaUpdate, target, eventContext, hookContext);
			}
			
			
		});
	});

	filter('items.delete', async (keys, meta, eventContext) => {
		// items.delete is a special case, where we want the filter event, so we can fetch data from the item before it's deleted
		// After fetching the data, we'll send an emitAction so that the flushing still happens AFTER the operation

		const config = await fetchCacheFlushConfig(hookContext);
		const currentEvent = meta.event.split('.')[1] as EventKey

		// check if current collection exists in flush settings
		// Skip if current mutation does not satisfy the schema
		if (!config.filter(target => target.schema && target.schema.find(c => c.collection === meta.collection && c.events.includes(currentEvent))).length) return; 

		for (const target of config) {
			const data = await fetchExistingFieldData({ keys, ...meta } as MetaDelete, target, eventContext, hookContext);
			if (data) hookContext.emitter.emitAction('flush_cache.delete', {
				meta: { keys, ...meta },
				target,
				data
			}, eventContext);
		}
	})

	hookContext.emitter.onAction('flush_cache.delete', async (payload: { meta: MetaDelete, target: FlushConfig, data: RecordData }, eventContext: EventContext ) => {
		await sendFlushRequest(payload.meta as MetaDelete, payload.target, eventContext, hookContext, payload.data);
	})

});
