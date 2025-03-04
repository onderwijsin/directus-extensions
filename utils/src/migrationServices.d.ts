import { Field, Collection, Relation } from '@directus/types';
import { ApiExtensionContext } from '@directus/extensions';
/**
 * Creates a collection from the provided schemas. If the collection already exists,
 * it updates the fields and relations. If the collection does not exist, it creates
 * the collection and its relations.
 *
 * @param collection - The name of the collection to create or update.
 * @param schemas - The schemas for the collection, fields, and relations.
 * @param schemas.collectionSchema - The schema for the collection.
 * @param schemas.fieldSchema - The schema for the fields.
 * @param schemas.relationSchema - The schema for the relations (optional).
 * @param context - The extensions context object.
 * @returns A promise that resolves when the collection and its relations are created or updated.
 */
export declare const createOrUpdateCollection: (collection: string, schemas: {
    collectionSchema: Collection;
    fieldSchema: Field[];
    relationSchema?: Relation[];
}, context: ApiExtensionContext) => Promise<void>;
/**
 * Creates or updates fields in a collection.
 *
 * @param collection - The name of the collection.
 * @param fieldSchema - The schema for the fields.
 * @param context - The extensions context object.
 * @returns A promise that resolves when the fields are created or updated.
 */
export declare const createOrUpdateFieldsInCollection: (collection: string, fieldSchema: Field[], context: ApiExtensionContext) => Promise<void>;
/**
 * Creates or updates relations for a collection.
 *
 * @param collection - The name of the collection.
 * @param relationSchema - The schema for the relations.
 * @param context - The extensions context object.
 * @returns A promise that resolves when the relations are created or updated.
 */
export declare const createOrUpdateRelationsInCollection: (collection: string, relationSchema: Relation[], context: ApiExtensionContext) => Promise<void>;
