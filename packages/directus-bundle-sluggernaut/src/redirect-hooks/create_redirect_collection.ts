import type { CollectionsService } from '@directus/api/dist/services';
import { checkAndUpdateFields, checkAndUpdateRelations, createCollectionAndRelations } from './utils';
import { fieldSchema, relationSchema, collectionSchema } from './schema';

interface Services {
    CollectionsService: typeof CollectionsService;
    [key: string]: any;
}

interface Context {
    services: Services;
    getSchema: () => Promise<any>;
}

/**
 * Creates a collection if it does not exist, and updates fields and relations if it does.
 * @param collection - The name of the collection to create or update.
 * @param context - The context object containing services and schema getter.
 */
export const createCollection = async (collection: string, { services, getSchema }: Context): Promise<void> => {
    const { CollectionsService } = services;

    const collectionsService: CollectionsService = new CollectionsService({
        schema: await getSchema(),
    });

    try {
        // Check if the collection exists
        await collectionsService.readOne(collection);
        // Update fields and relations if the collection exists
        await checkAndUpdateFields({ collection, services, getSchema, fieldSchema });
        await checkAndUpdateRelations({ collection, services, getSchema, relationSchema });
    } catch (error) {
        console.log('No redirects collection found. Creating it now');
        // Create the collection and relations if it does not exist
        await createCollectionAndRelations({ collection, services, getSchema, collectionSchema, fieldSchema, relationSchema });
    }
};