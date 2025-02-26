import { defineHook } from '@directus/extensions-sdk';
import { fieldSchema, relationSchema, collectionSchema } from './schema';
import { createCollectionFromSchemas } from './createCollection';
import { addFieldsToDirectusSettings } from './addSettingsFields';
import { addNamespaceFieldToCollections } from './addNamespaceField';
import { getRedirectSettings, preventInfiniteLoop, recursivelyGetRedirectIDsByDestination } from './utils';
import { EventContext } from '@directus/types';
const collection = 'redirects';


export default defineHook(async (
	_,
	{ getSchema, services, emitter, logger }
) => {

	// /* STEP 1: Create redirect collection, fields and relations, or update existing ones with inproper config */
	await createCollectionFromSchemas(collection, { services, getSchema }, { fieldSchema, relationSchema, collectionSchema });

	// /* STEP 2: add namespace field to collections */
	// await addNamespaceFieldToCollections({ services, getSchema });

	// /* STEP 3: add redirect config fields to directus_settings */
	// await addFieldsToDirectusSettings({ services, getSchema });


	emitter.onAction('slug.update', async (payload: SlugUpdateEvent, context: EventContext) => {
		const { ItemsService } = services
		const items = new ItemsService(collection, context);

		// Get redirect config
		const { use_namespace, use_trailing_slash, namespace } = await getRedirectSettings(payload.collection, services, getSchema);
		const destination = `/${use_namespace && !!namespace ? (namespace + '/') : ''}${payload.newValue}${use_trailing_slash ? '/' : ''}`
		
		// First prevent an infinite loop by deleting any redirects that have the new destination as their origin
		await preventInfiniteLoop(destination, collection, services, getSchema);

		// Secondly, create the redirect(s)
		items.createMany(payload.oldValues.map(oldValue => ({
			origin: `/${use_namespace && !!namespace ? (namespace + '/') : ''}${oldValue}${use_trailing_slash ? '/' : ''}`,
			destination,
			type: 301,
			is_active: true
		}) as RedirectCreate))
	})


	emitter.onAction('slug.delete', async (payload: SlugDeleteEvent, context: EventContext) => {
		const { use_namespace, use_trailing_slash, namespace } = await getRedirectSettings(payload.collection, services, getSchema);

		// Get an array of redirect IDs to delete that are assiociated with the deleted slugs
		const idsToDelete = await recursivelyGetRedirectIDsByDestination(
			payload.slugs.map(slug => `/${use_namespace && !!namespace ? (namespace + '/') : ''}${slug}${use_trailing_slash ? '/' : ''}`), 
			collection, 
			services, 
			getSchema
		);

		const { ItemsService } = services
		const items = new ItemsService(collection, context);

		logger.info(`Deleting ${idsToDelete.length} redirects because they were associated with the deleted slugs`, {
			redirect_ids: idsToDelete,
			slugs: payload.slugs
		});
		items.deleteMany(idsToDelete);

	})
});


