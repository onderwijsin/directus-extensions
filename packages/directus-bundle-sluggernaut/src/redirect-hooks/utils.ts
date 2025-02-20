import type { FieldRaw, Relation, Collection } from '@directus/types';
import type { CollectionsService, FieldsService, RelationsService } from '@directus/api/dist/services';

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
export const checkAndUpdateFields = async (options: { collection: string, services: any, getSchema: any, fieldSchema: FieldRaw[]}) => {
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
export const checkAndUpdateRelations = async (options: { collection: string, services: any, getSchema: any, relationSchema: Relation[] }) => {
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
export const createCollectionAndRelations = async (options: { collection: string, services: any, getSchema: any, collectionSchema: Collection, fieldSchema: FieldRaw[], relationSchema: Relation[]}) => {

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

    const relationsService = new RelationsService({
        schema: await getSchema(),
    });

    for (const relation of relationSchema) {
        await relationsService.createOne(relation);
    }
};