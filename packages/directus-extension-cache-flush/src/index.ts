import { defineHook } from '@directus/extensions-sdk';

import { createOrUpdateCollection, createOrUpdateRelationsInCollection } from 'utils';
import { 
	collectionSchema, collectionFieldSchema, collectionRelationSchema,
	junctionSchema, junctionFieldSchema, junctionRelationSchema 
} from './schema';

import { fetchCacheFlushConfig } from './utils';



export default defineHook(async ({ action }, hookContext) => {

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

	["items.create", "items.update", "items.delete"].forEach(event => {
		action(event, async (meta, eventContext) => {

			const config = await fetchCacheFlushConfig(hookContext);
			// check if current collection exists in flush settings
			// if not, return

			/* 
				1. Get flush endpoints
				2. Loop over endpoints, and for each:
					- find variable for unique identifier
					- sent post request to endpoint with unique identifier
				3. Log success/failure
				4. If failure, sent notification to registered user
			*/
			
		});
	});
});
