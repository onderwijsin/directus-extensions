import type { CollectionsService } from '@directus/api/dist/services';
import { checkAndUpdateFields, checkAndUpdateRelations, createCollectionAndRelations } from './utils';
import { fieldSchema, relationSchema, collectionSchema } from './schema';

export const createCollection = async (collection: string, { services, getSchema }: any) => {
    const { CollectionsService } = services;

    const collectionsService: CollectionsService = new CollectionsService({
        schema: await getSchema(),
    });

    
    try {
        await collectionsService.readOne(collection);
        await checkAndUpdateFields({ collection, services, getSchema, fieldSchema });
        await checkAndUpdateRelations({ collection, services, getSchema, relationSchema });
    } catch (error) {
        console.log('No redirects collection found. Creating it now');
        await createCollectionAndRelations({ collection, services, getSchema, collectionSchema, fieldSchema, relationSchema });
    }
};