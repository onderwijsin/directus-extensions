
import type { CollectionsService, FieldsService, RelationsService } from '@directus/api/dist/services';
import { checkAndUpdateFields, checkAndUpdateRelations, createCollectionAndRelations } from './utils';
import type { Collection, FieldRaw, Relation } from '@directus/types';

interface Services {
    CollectionsService: typeof CollectionsService;
    FieldsService: typeof FieldsService;
    RelationsService: typeof RelationsService;
}

interface Context {
    services: Services;
    getSchema: () => Promise<any>;
}

interface Schemas {
    collectionSchema: Collection;
    fieldSchema: FieldRaw[];
    relationSchema?: Relation[];
}

/**
 * Creates a collection from the provided schemas. If the collection already exists,
 * it updates the fields and relations. If the collection does not exist, it creates
 * the collection and its relations.
 *
 * @param collection - The name of the collection to create or update.
 * @param context - The context containing services and schema retrieval function.
 * @param context.services - An object containing the CollectionsService and other services.
 * @param context.getSchema - A function that returns a promise resolving to the schema.
 * @param schemas - The schemas for the collection, fields, and relations.
 * @param schemas.collectionSchema - The schema for the collection.
 * @param schemas.fieldSchema - The schema for the fields.
 * @param schemas.relationSchema - The schema for the relations (optional).
 * @returns A promise that resolves when the collection and its relations are created or updated.
 */
export const createCollectionFromSchemas = async (
    collection: string, 
    { services, getSchema }: Context, 
    { collectionSchema, fieldSchema, relationSchema }: Schemas
): Promise<void> => {
    const { CollectionsService } = services;

    const collectionsService: CollectionsService = new CollectionsService({
        schema: await getSchema(),
    });

    try {
        // Check if the collection exists
        await collectionsService.readOne(collection);
        // Update fields and relations if the collection exists
        await checkAndUpdateFields({ collection, services, getSchema, fieldSchema });
        if (relationSchema) await checkAndUpdateRelations({ collection, services, getSchema, relationSchema });
    } catch (error) {
        console.log(`No ${collection} collection found. Creating it now`);
        // Create the collection and relations if it does not exist
        await createCollectionAndRelations({ collection, services, getSchema, collectionSchema, fieldSchema, relationSchema });
        
    }
};