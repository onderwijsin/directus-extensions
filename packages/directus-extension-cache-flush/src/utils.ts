
import type { ApiExtensionContext } from '@directus/extensions';
import { FlushConfig, RawFlushConfig, RecordData } from './types';
import { ItemsService } from '@directus/api/dist/services';
import { EventContext } from '@directus/types';
import { createNotifcation } from 'utils';
import type { ActionMetaUpdate, ActionMetaDelete } from 'utils'
/**
 * Validates the provided schema to ensure it meets the required structure.
 *
 * @param schema - The schema to validate. It should be an array of objects, each containing
 *                 `collection`, `events`, and `fields` properties.
 * @returns The validated schema if it is valid, otherwise `null`.
 *
 * The schema is considered valid if:
 * - It is an array.
 * - Each object in the array has `collection`, `events`, and `fields` properties.
 * - `events` and `fields` are arrays.
 * - `events` contains only 'create', 'update', or 'delete' strings.
 * - `fields` contains only strings.
 * - `collection` is a string.
 */
export const validateSchema = (schema: Record<string, any>[] | null): FlushConfig['schema'] => {
    const errors = []
    if (!schema || !Array.isArray(schema)) errors.push('Schema is not an array');
    if (!schema || errors.length) return null;
    const isValid = schema.every(({ collection, events, payload }) => {
        if (!collection || !events || !payload) errors.push('Schema object is missing required properties');
        if (!Array.isArray(events) || !Array.isArray(payload)) errors.push('Events and fields must be arrays');
        if (!events.every((event: any) => ['create', 'update', 'delete'].includes(event))) errors.push('Events must only contain "create", "update", or "delete" strings');
        if (!payload.every((field: any) => typeof field === 'string')) errors.push('Fields must only contain strings');
        if (typeof collection !== 'string') errors.push('Collection must be a string');
        return !errors.length;
    });
    if (!isValid) console.log('Schema validation errors', errors)
    return isValid ? schema as FlushConfig['schema'] : null;
}


export const fetchCacheFlushConfig = async (eventContext: EventContext, context: ApiExtensionContext): Promise<FlushConfig[]> => {
    const { ItemsService } = context.services
    const items: ItemsService = new ItemsService('cache_flush_targets', {
        schema: eventContext.schema,
        knex: eventContext.database
    })
    const targets = await items.readByQuery({
        filter: {
            status: {
                _eq: 'published'
            }
        },
        fields: [
            'id',
            'url',
            'api_key',
            'auth_header',
            'status',
            'schema',
            'users_notification.directus_users_id'
        ]
    }) as RawFlushConfig[]

    return targets.map((remote: RawFlushConfig): FlushConfig => {
        return {
            id: remote.id,
            status: remote.status,
            url: remote.url,
            api_key: remote.api_key,
            auth_header: remote.auth_header,
            schema: validateSchema(remote.schema),
            users_notification: remote.users_notification.map(user => user.directus_users_id)
        }
    })
}


/**
 * Fetches additional fields for the given meta data.
 *
 * @param meta - The meta data for the update or delete operation.
 * @param config - The cache flush configuration.
 * @param eventContext - The event context.
 * @param hookContext - The hook context.
 * @returns The additional fields if they could be fetched, otherwise `null`.
 */
export const fetchExistingFieldData = async (
    meta: ActionMetaUpdate | ActionMetaDelete, 
    config: FlushConfig, 
    eventContext: EventContext, 
    hookContext: ApiExtensionContext
): Promise<RecordData | null> => {
    const { ItemsService } = hookContext.services;
    const items = new ItemsService(meta.collection, {
        schema: eventContext.schema,
        knex: eventContext.database
    });

    const { url, schema } = config;

    if (!schema) return null;
    const collection = schema.find(c => c.collection === meta.collection);
    if (!collection) return null;

    try {
        const data = await items.readMany(meta.keys, {
            fields: collection.payload.includes('id') ? collection.payload : ['id', ...collection.payload]
        }) as RecordData;

        return data
    } catch (error: any) {
        hookContext.logger.warn('Error fetching additional fields for cache flush to: ' + url + ' with id: ' + meta.keys.join(', ') + 'in collection: ' + meta.collection);
        if (error?.message) hookContext.logger.warn(error.message)

        for (const userId of config.users_notification) {
            await createNotifcation({
                collection: meta.collection,
                userId,
                itemId: meta.keys.join(', '),
                event: meta.event.split('.')[1] as 'create' | 'update' | 'delete',
                subject: 'Cache Flush Schema error',
                message: 'Error fetching additional fields for cache flush. This is most likely due to a schema misconfiguration. Please check the schema configuration in the cache_flush_targets collection. Until you fix the schema, the Cache Flush extension will not work for this target.',
                customProps: {
                    url: config.url
                }
            }, eventContext, hookContext)
        }
        return null
    }
}