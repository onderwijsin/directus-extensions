import type { FieldRaw, Relation, Collection, PrimaryKey, SchemaOverview, EventContext } from '@directus/types';
import type { CollectionsService, FieldsService, RelationsService, ItemsService } from '@directus/api/dist/services';
import { HookExtensionContext } from '@directus/extensions';

/**
 * Compares two field configurations to check if they are equal.
 * 
 * @param field1 - The first field configuration.
 * @param field2 - The second field configuration.
 * @returns True if the field configurations are equal, false otherwise.
 */
export const equalFieldConfig = (field1: FieldRaw, field2: FieldRaw): boolean => {
    return field1.type === field2.type && ((!field1.schema || !field1.schema && !field2.schema || Object.entries(field1.schema).every(([key, value]) => field2.schema?.[key as keyof typeof field2.schema] === value)))
}

/**
 * Compares two relation configurations to check if they are equal.
 * 
 * @param field1 - The first relation configuration.
 * @param field2 - The second relation configuration.
 * @returns True if the relation configurations are equal, false otherwise.
 */
export const equalRelationConfig = (field1: Relation, field2: Relation): boolean => {
    return field1.collection === field2.collection && field1.related_collection === field2.related_collection && (!field1.schema || !field1.schema && !field2.schema || Object.entries(field1.schema).every(([key, value]) => field2.schema?.[key as keyof typeof field2.schema] === value)) 
}

/**
 * Checks and updates fields in a collection.
 * 
 * @param options - The options for checking and updating fields.
 * @param options.collection - The name of the collection.
 * @param options.services - The services to use for updating fields.
 * @param options.getSchema - A function to get the schema.
 * @param options.fieldSchema - The schema of the fields to check and update.
 */
export const checkAndUpdateFields = async (options: { 
    collection: string, 
    services: { FieldsService: typeof FieldsService}, 
    getSchema: () => Promise<SchemaOverview>, 
    fieldSchema: FieldRaw[]
}) => {
    const { collection, services, getSchema, fieldSchema } = options;

    const { FieldsService } = services;
    const fieldsService: FieldsService = new FieldsService({
        schema: await getSchema(),
    });

    const fields = await fieldsService.readAll(collection);
    const missingFields: FieldRaw[] = [];
    const invalidFields: FieldRaw[] = [];

    fieldSchema.forEach((field) => {
        const existingField = fields.find((f: FieldRaw) => f.field === field.field);
        if (!existingField) {
            missingFields.push(field);
        } else if (!equalFieldConfig(field, existingField)) {
            invalidFields.push(field);
        }
    });

    if (missingFields.length > 0) {
        console.log('Found missing fields. Adding them now');
        for (const field of missingFields) {
            await fieldsService.createField(collection, field);
        }
    }

    if (invalidFields.length > 0) {
        console.log('Found invalid field configuration. Resetting field');
        await fieldsService.updateFields(collection, invalidFields);
    }
};

/**
 * Checks and updates relations in a collection.
 * 
 * @param options - The options for checking and updating relations.
 * @param options.collection - The name of the collection.
 * @param options.services - The services to use for updating relations.
 * @param options.getSchema - A function to get the schema.
 * @param options.relationSchema - The schema of the relations to check and update.
 */
export const checkAndUpdateRelations = async (options: { 
    collection: string, 
    services: { RelationsService: typeof RelationsService }, 
    getSchema: () => Promise<SchemaOverview>, 
    relationSchema: Relation[] }
) => {
    const { collection, services, getSchema, relationSchema } = options;
    const { RelationsService } = services;
    const relationsService: RelationsService = new RelationsService({
        schema: await getSchema(),
    });

    const relations = await relationsService.readAll(collection);
    const missingRelations: Relation[] = [];
    const invalidRelations: Relation[] = [];

    relationSchema.forEach((relation) => {
        const existingRelation = relations.find((r: Relation) => r.field === relation.field);
        if (!existingRelation) {
            missingRelations.push(relation);
        } else if (!equalRelationConfig(relation, existingRelation)) {
            invalidRelations.push(relation);
        }
    });

    if (missingRelations.length > 0) {
        console.log('Found missing relations. Adding them now');
        for (const rel of missingRelations) {
            await relationsService.createOne(rel);
        }
    }

    if (invalidRelations.length > 0) {
        console.log('Found invalid relations. Resetting relation');
        for (const rel of invalidRelations) {
            await relationsService.updateOne(collection, rel.field, rel);
        }
    }
};

/**
 * Creates a collection and its relations.
 * 
 * @param options - The options for creating the collection and relations.
 * @param options.collection - The name of the collection.
 * @param options.services - The services to use for creating the collection and relations.
 * @param options.getSchema - A function to get the schema.
 * @param options.collectionSchema - The schema of the collection to create.
 * @param options.fieldSchema - The schema of the fields to create.
 * @param options.relationSchema - The schema of the relations to create.
 */
export const createCollectionAndRelations = async (options: { 
    collection: string, 
    services: { CollectionsService: typeof CollectionsService, RelationsService: typeof RelationsService }, 
    getSchema: () => Promise<SchemaOverview>,
    collectionSchema: Collection, 
    fieldSchema: FieldRaw[], 
    relationSchema?: Relation[]
}) => {

    const { collection, services, getSchema, collectionSchema, fieldSchema, relationSchema } = options;

    const { CollectionsService, RelationsService } = services;
    const collectionsService: CollectionsService = new CollectionsService({
        schema: await getSchema(),
    });

    await collectionsService.createOne({
        ...collectionSchema,
        fields: fieldSchema,
        collection,
    });

    if (relationSchema) {
        const relationsService = new RelationsService({
            schema: await getSchema(),
        });
    
        for (const relation of relationSchema) {
            await relationsService.createOne(relation);
        }
    }
    
};


/**
 * Prevents infinite redirect loops by deleting redirects with the specified destination.
 * 
 * @param destination - The destination URL to check for infinite loops.
 * @param collection - The name of the collection.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves when the operation is complete.
 */
export const preventInfiniteLoop = async (
    destination: string, 
    collection: string, 
    eventContext: EventContext,
    hookContext: HookExtensionContext
): Promise<void> => {
    const { ItemsService } = hookContext.services;
    const redirects: ItemsService = new ItemsService(collection, { schema: await hookContext.getSchema(), accountability: eventContext.accountability });
    redirects.deleteByQuery({ filter: { origin: { _eq: destination } }})
}

/**
 * Recursively retrieves redirect IDs by destination.
 * 
 * @param value - The destination value(s) to search for.
 * @param collection - The name of the collection.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves to an array of primary keys.
 */
export const recursivelyGetRedirectIDsByDestination = async (
    value: string | string[], 
    collection: string, 
    eventContext: EventContext,
    hookContext: HookExtensionContext
): Promise<PrimaryKey[]> => {
    const { ItemsService } = hookContext.services
    const items: ItemsService = new ItemsService(collection, { schema: await hookContext.getSchema(), accountability: eventContext.accountability });

    if (!Array.isArray(value)) value = [value];

    const data = await items.readByQuery({
        filter: {
            destination: {
                _in: value
            }
        },
        fields: ['id', 'origin']
    })

    if (data.length === 0) return [];
    
    const nestedData = await recursivelyGetRedirectIDsByDestination(data.map(item => item.origin), collection, eventContext, hookContext);
    
    return [...data.map(item => item.id), ...nestedData];
}