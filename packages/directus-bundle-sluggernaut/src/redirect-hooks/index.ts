import { defineHook } from '@directus/extensions-sdk';

import { createCollection } from './create_redirect_collection';
import { addFieldsToDirectusSettings } from './add_settings_fields';
import { addNamespaceFieldToCollections } from './add_namespace_field';
const collection = 'redirects';



export default defineHook(async (
	{ filter, action },
	{ getSchema, services }
) => {

	/* STEP 1: Create redirect collection, fields and relations, or update existing ones with inproper config */
	await createCollection(collection, { services, getSchema });

	/* STEP 2: add namespace field to collections */
	await addNamespaceFieldToCollections({ services, getSchema });

	/* STEP 3: add redirect config fields to directus_settings */
	await addFieldsToDirectusSettings({ services, getSchema });


	// Example hooks
	filter('items.create', () => {
		console.log('Creating Item!');
	});

	action('items.create', () => {
		console.log('Item created!');
	});

	action('items.update', () => {
		console.log('Item updated!');
	});

});