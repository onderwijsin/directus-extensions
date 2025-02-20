import { defineHook } from '@directus/extensions-sdk';

import { createCollection } from './create_redirect_collection';
import { addFieldsToDirectusSettings } from './add_settings_fields';
import { addNamespaceFieldToCollections } from './add_namespace_field';
const collection = 'redirects';



export default defineHook(async (
	{ action },
	{ getSchema, services, emitter }
) => {

	/* STEP 1: Create redirect collection, fields and relations, or update existing ones with inproper config */
	await createCollection(collection, { services, getSchema });

	/* STEP 2: add namespace field to collections */
	await addNamespaceFieldToCollections({ services, getSchema });

	/* STEP 3: add redirect config fields to directus_settings */
	await addFieldsToDirectusSettings({ services, getSchema });
	

	action('items.delete', () => {
		// get collections that use slug interface
		// check if deleted slug or namesapce + slug has a redirect.destination
		// If so, delete the redirect
		// Recursively check if the deleted redirect.origin is present in collection as redirect.destination, if so, delete the redirect
	});


	emitter.onAction('slug.update', async (payload: SlugUpdateEvent) => {
		// init items service
		// create redirect from old slug to new slug
		// check for infinite redirect loops and handle accordingly
	})

});