import type { PrimaryKey, EventContext } from '@directus/types';
import type { ItemsService } from '@directus/api/dist/services';
import { HookExtensionContext } from '@directus/extensions';
import { createError } from '@directus/errors';


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
    const redirects: ItemsService = new ItemsService(collection, {
        schema: eventContext.schema,
        knex: eventContext.database
    });
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
    const items: ItemsService = new ItemsService(collection, {
        schema: eventContext.schema,
        knex: eventContext.database
    });

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


const EqualOriginAndDestinationError = createError(
    'INVALID_PAYLOAD_ERROR',
    "A redirect origin can not be the same as its destination",
    400
);


/**
 * Checks existing redirect against a partial payload to prevent duplicate redirects.
 * 
 * @param field - The field to check for existing redirects.
 * @param payload - The payload to check.
 * @param meta - The metadata object.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves when the operation is complete.
 */
const checkExitsingRedirects = async (
    field: 'destination' | 'origin',
    payload: Record<string, any>,
    meta: Record<string, any>,
    eventContext: EventContext,
    hookContext: HookExtensionContext,
) => {
    const { ItemsService } = hookContext.services
    const items: ItemsService = new ItemsService(meta.collection, {
        schema: eventContext.schema,
        knex: eventContext.database
    });
    const redirects = await items.readMany(meta.keys, {fields: [field] });
    if (redirects.some(redirect => redirect[field] === payload[field === 'destination' ? 'origin' : 'destination'])) {
        throw new EqualOriginAndDestinationError()
    }
}

/**
 * Validates the redirect payload to prevent infinite loops and other issues.
 * 
 * @param payload - The payload to validate.
 * @param meta - The metadata object.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves when the operation is complete.
 */
export const validateRedirect = async (
    payload: Record<string, any>,
    meta: Record<string, any>,
    eventContext: EventContext,
    hookContext: HookExtensionContext
) => {
    if ((payload.hasOwnProperty('origin') && payload.hasOwnProperty('destination')) && payload.origin === payload.destination) {
        throw new EqualOriginAndDestinationError()
    } else if (payload.hasOwnProperty('origin') && meta.event.includes('.update')) {
        await (checkExitsingRedirects('destination', payload, meta, eventContext, hookContext))
    } else if (payload.hasOwnProperty('destination') && meta.event.includes('.update')) {
        await (checkExitsingRedirects('origin', payload, meta, eventContext, hookContext))
    }
}
