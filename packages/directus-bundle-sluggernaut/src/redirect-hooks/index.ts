import { defineHook } from '@directus/extensions-sdk';

import { createCollection } from './create_redirect_collection';
import { addFieldsToDirectusSettings } from './add_settings_fields';
import { addNamespaceFieldToCollections } from './add_namespace_field';
const collection = 'redirects';



export default defineHook(async (
	_,
	{ getSchema, services, emitter, logger }
) => {

	/* STEP 1: Create redirect collection, fields and relations, or update existing ones with inproper config */
	await createCollection(collection, { services, getSchema });

	/* STEP 2: add namespace field to collections */
	await addNamespaceFieldToCollections({ services, getSchema });

	/* STEP 3: add redirect config fields to directus_settings */
	await addFieldsToDirectusSettings({ services, getSchema });



	emitter.onAction('slug.update', async (payload: SlugUpdateEvent) => {
		// init items service
		// create redirect from old slug to new slug
		// check for infinite redirect loops and handle accordingly
		logger.info('Slug update event');

	})

	emitter.onAction('slug.delete', async (payload: SlugDeleteEvent) => {
		logger.info('Slug delete event');
	})
});