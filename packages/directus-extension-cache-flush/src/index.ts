import { defineHook } from '@directus/extensions-sdk';

import { createOrUpdateCollection, createOrUpdateRelationsInCollection } from 'utils';
import { 
	collectionSchema, collectionFieldSchema, collectionRelationSchema,
	junctionSchema, junctionFieldSchema, junctionRelationSchema 
} from './schema';

import { fetchCacheFlushConfig } from './utils';
import type { EventKey, Meta } from './types';
import { sendFlushRequest } from './flush';


export default defineHook(async ({ action }, hookContext) => {
	const { CACHE_FLUSH_DISABLE_SCHEMA_CHANGE, DISABLE_EXTENSION_SCHEMA_CHANGE } = hookContext.env;
	const disableSchemaChange = (!!CACHE_FLUSH_DISABLE_SCHEMA_CHANGE && (CACHE_FLUSH_DISABLE_SCHEMA_CHANGE === 'true' || CACHE_FLUSH_DISABLE_SCHEMA_CHANGE === true)) || (!!DISABLE_EXTENSION_SCHEMA_CHANGE && (DISABLE_EXTENSION_SCHEMA_CHANGE === 'true' || DISABLE_EXTENSION_SCHEMA_CHANGE === true));
	
	if (!disableSchemaChange || true) {
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
	

	(["items.create", "items.update", "items.delete"] as const).forEach(event => {
		action(event, async (meta, eventContext) => {

			const config = await fetchCacheFlushConfig(hookContext);

			const currentEvent = event.split('.')[1] as EventKey
			// check if current collection exists in flush settings
			// Skip if current mutation does not satisfy the schema
			if (!config.filter(target => target.schema && target.schema.find(c => c.collection === meta.collection && c.events.includes(currentEvent))).length) return; 

			for (const target of config) {
				await sendFlushRequest(meta as Meta, target, eventContext, hookContext);
			}
			
			
		});
	});
});
