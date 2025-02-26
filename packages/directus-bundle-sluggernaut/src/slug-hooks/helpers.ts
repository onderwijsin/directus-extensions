import { createError } from '@directus/errors';
import { extensions } from './constants';
import slugify from 'slugify';

import type { Field, FieldMeta, PrimaryKey, SchemaOverview, Accountability, CollectionMeta } from '@directus/types';
import type { FieldsService, ItemsService, CollectionsService } from '@directus/api/dist/services';

slugify.extend(extensions)

type Options = {
	fields: string[];
	output_key: string;
	locale?: string
	make_unique?: boolean;
	lowercase?: boolean;
};


/**
 * Generates a random string of the specified length.
 * @param length - The length of the random string.
 * @returns A random string of the specified length.
 */
function randomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const EditMultipleError = createError(
    'INVALID_PAYLOAD_ERROR',
    "Editing multiple items of a collection with multiple slug input fields, without providing each input, is not supported. Please edit one item at a time.",
    400
);


/**
 * Generates a slug based on the provided payload and options.
 * @param meta - Metadata about the event.
 * @param payload - The payload object.
 * @param context - The context object.
 * @param options - Options for slug generation.
 * @returns The generated slug or null if no relevant input was provided.
 */
export const slugifyInputs = async (
    meta: Record<string, any>,
    payload: Record<string, any>,
    context: any,
    { fields, output_key, locale = 'nl', make_unique = false, lowercase = true }: Options
): Promise<string | null> => {
    // If slug was manually provided, use that as a value
    let value = payload[output_key] || '';

    if (!value) {
        let values = fields.map(field => payload[field]).filter(Boolean);

        // If not all fields are filled and the trigger is an update event, fetch existing values for unmodified fields
        if (values.length < fields.length && meta.event.includes('.update')) {
            if (meta.keys.length > 1) throw new EditMultipleError();

            const missingValues = fields.filter(field => !payload[field]);
            const { services, getSchema } = context;
            const { ItemsService } = services;
            const itemsService = new ItemsService(meta.collection, { schema: await getSchema() });

            const item = await itemsService.readMany(meta.keys, { fields: missingValues });
            values = fields.map(field => payload[field] || item[0][field]).filter(Boolean);
        }

        value = values.join('-');
    }

    // If no relevant input was provided, return null
    if (!value) return null;

    // Slugify the value with options
    let slug = slugify(value, {
        replacement: '-',
        locale: locale === 'en' ? undefined : locale,
        lower: lowercase,
        trim: true,
        strict: true,
        remove: /[*+~.()'"?!:@]/g
    });

    if (make_unique) {
        slug += `-${randomString(6)}`;
    }

    return slug;
};


/**
 * Finds the slug field in a given collection.
 * @param collection - The collection name.
 * @param services - The services object.
 * @param getSchema - Function to get the schema overview.
 * @returns The slug field if found, otherwise undefined.
 */
export const findSlugFieldInCollection = async (
    collection: string,
    services: { FieldsService: typeof FieldsService },
    getSchema: () => Promise<SchemaOverview>
): Promise<Field | undefined> => {
    const { FieldsService } = services;
    const fieldsService = new FieldsService({ schema: await getSchema() });
    const collectionFields = await fieldsService.readAll(collection);
    return collectionFields.find((field: Field) => field.meta?.interface === 'oslug_interface');
};

/**
 * Generates the slug value based on the provided payload and slug field.
 * @param payload - The payload object.
 * @param meta - Metadata about the event.
 * @param context - The context object.
 * @param slugField - The slug field.
 * @returns An object containing the slug key and value, or undefined.
 */
export const getSlugValue = async (
    payload: Record<string, any>,
    meta: Record<string, any>,
    context: any,
    slugField: Field
): Promise<{ key: string; value: string | null } | undefined> => {
    if (slugField.meta?.options?.on_create && meta.event !== 'items.create') return;

    const hasInput = (slugField.meta as FieldMeta).options?.fields.some((field: string) => payload.hasOwnProperty(field));
    if (!hasInput && !payload.hasOwnProperty(slugField.field)) return;

    return {
        key: slugField.field,
        value: await slugifyInputs(meta, payload, context, {
            fields: slugField.meta?.options?.fields,
            output_key: slugField.field,
            locale: slugField.meta?.options?.locale,
            make_unique: slugField.meta?.options?.make_unique,
            lowercase: slugField.meta?.options?.lowercase
        })
    };
};

/**
 * Finds the archive field key and archive value in a specified collection.
 *
 * @param collection - The name of the collection to search in.
 * @param services - An object containing the CollectionService.
 * @param getSchema - A function that returns a promise resolving to the schema overview.
 * @returns An object containing the archive field key and archive value.
 *
 * @example
 * ```typescript
 * const result = await findArchiveValueInCollection('my_collection', { CollectionService }, getSchema);
 * console.log(result.archive_field_key); // Outputs the archive field key
 * console.log(result.archive_value); // Outputs the archive value
 * ```
 */
export const findArchiveValueInCollection = async (
    collection: string, 
    services: { CollectionsService: typeof CollectionsService }, 
    getSchema: () => Promise<SchemaOverview>
) => {
    const { CollectionsService } = services;
    const collections = new CollectionsService({ schema: await getSchema() });

    const data = await collections.readOne(collection);
    return {
        archive_field_key: (data.meta as CollectionMeta)?.archive_field,
        archive_value: (data.meta as CollectionMeta)?.archive_value
    }
}

/**
 * Finds existing items in a collection based on the provided keys and returns slug values.
 * @param collection - The collection name.
 * @param services - The services object.
 * @param getSchema - Function to get the schema overview.
 * @param accountability - The accountability object.
 * @param keys - The primary keys of the items to find.
 * @param fieldKey - The field key to include in the result.
 * @returns The found items.
 */
export const findExistingItems = async (
    collection: string,
    services: { ItemsService: typeof ItemsService },
    getSchema: () => Promise<SchemaOverview>,
    accountability: Accountability | null,
    keys: PrimaryKey[],
    fields: string[],
    filter: Record<string, any> = {}
): Promise<Record<string, any>[]> => {
    const { ItemsService } = services;
    const itemsService = new ItemsService(collection, {
        schema: await getSchema(),
        accountability
    });
    return await itemsService.readMany(keys, { fields, filter });
};