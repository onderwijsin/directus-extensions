import { ofetch } from 'ofetch';
import { EventContext, PrimaryKey } from '@directus/types';
import { ApiExtensionContext } from '@directus/extensions';
import type { FlushConfig, RecordData, Payload } from './types';
import { createNotifcation, pruneObjByKeys } from 'utils';
import { fetchExistingFieldData } from './utils';

import type { ActionMeta } from 'utils'



/**
 * Sends a notification to configured users about cache flush events.
 * 
 * @param meta - Metadata related to the event.
 * @param config - Configuration settings for cache flushing.
 * @param hookContext - Directus API extension context.
 * @param eventContext - Directus event context.
 * @param subject - Subject of the notification.
 * @param message - Message content of the notification.
 */
const notifyUsers = async (
    meta: ActionMeta,
    config: FlushConfig,
    hookContext: ApiExtensionContext,
    eventContext: EventContext,
    subject: string,
    message?: string
) => {
    for (const userId of config.users_notification) {
        await createNotifcation({
            collection: meta.collection,
            userId,
            itemId: 'key' in meta ? meta.key : meta.keys.join(', '),
            event: meta.event.split('.')[1] as 'create' | 'update' | 'delete',
            subject,
            message,
            customProps: { url: config.url }
        }, eventContext, hookContext);
    }
};

/**
 * Sends a cache flush request to a configured external endpoint.
 * 
 * @param url - The target URL to send the flush request to.
 * @param headers - Request headers including authentication.
 * @param payloads - The data payload for the request.
 * @param logger - Logger for recording success or failure.
 */

const sendFlushRequestToEndpoint = async (
    url: string,
    headers: Record<string, string>,
    payloads: Payload[],
    logger: any,
) => {
    try {
        await ofetch(url, {
            method: 'POST',
            headers,
            body: payloads
        });
        logger.info(`Successfully sent cache flush to: ${url} with ids: ${payloads.map(p => p.fields.id).join(', ')} in collection: ${payloads[0]?.collection}`);
    } catch (error: any) {
        logger.warn(`Error sending cache flush to: ${url} with ids: ${payloads.map(p => p.fields.id).join(', ')} in collection: ${payloads[0]?.collection}`);
        logger.warn(error?.message || error);
        throw error;
    }
};


/**
 * Handles cache flush requests by determining the appropriate payload and sending it to the configured endpoint.
 * 
 * @param meta - Metadata of the event, including collection, keys, and payload.
 * @param config - Configuration object defining flush settings.
 * @param eventContext - Directus event context.
 * @param hookContext - Directus API extension context.
 * @param recordData - Optional preloaded data for delete events.
 */

/**
 * Sends a flush request to the configured endpoint based on the provided metadata and configuration.
 *
 * @param meta - Metadata about the action being performed.
 * @param config - Configuration for the flush request, including schema, URL, and authentication details.
 * @param eventContext - Context of the event triggering the flush request.
 * @param hookContext - Context of the API extension, including logger.
 * @param recordData - Optional data about the records involved in the action.
 *
 * The function performs the following steps:
 * 1. Logs a warning and notifies users if the schema is not properly configured.
 * 2. Extracts the URL, authentication header, API key, and schema from the configuration.
 * 3. Finds the collection in the schema that matches the metadata collection.
 * 4. Constructs the headers for the request based on the authentication method.
 * 5. Determines the type of event (create, update, delete) from the metadata.
 * 6. Constructs payloads for the flush request based on the event type:
 *    - For create events, constructs a payload with the new record data.
 *    - For update events, constructs payloads with updated record data, fetching existing data if necessary.
 *    - For delete events, constructs payloads with the record data to be deleted. This data is provided in 
 *      the argument, since delete events are a special case where data is prefetched in a filter hook.
 * 7. Sends the flush request to the endpoint if there are any payloads to send.
 * 8. Notifies users in case of an error during the flush request.
 */
export const sendFlushRequest = async (
    meta: ActionMeta,
    config: FlushConfig, 
    eventContext: EventContext, 
    hookContext: ApiExtensionContext,
    recordData?: RecordData
) => {
    const { logger } = hookContext;

    if (!config.schema) {
        const message = 'Schema is not properly configured. Please check the schema configuration in the cache_flush_targets collection. Until you fix the schema, the Cache Flush extension will not work for this target.';
        logger.warn(message);
        await notifyUsers(meta, config, hookContext, eventContext, 'Cache Flush Schema error', message);
        return;
    }

    const { url, auth_header, api_key, schema } = config;
    const collection = schema.find(c => c.collection === meta.collection);
    if (!collection) return;

    const headers = {
        [auth_header === 'bearer' ? "Authorization" : auth_header === 'api-key' ? 'Api-Key' : auth_header]: 
        auth_header === 'bearer' ? `Bearer ${api_key}` : api_key || ''
    };

    const isCreate = meta.event === 'items.create';
    const isUpdate = meta.event === 'items.update';
    const isDelete = meta.event === 'items.delete';

    let payloads: Payload[] = [];

    if (isCreate) {
        let payload: Payload = {
            collection: meta.collection,
            event: 'create',
            fields: {
                ...pruneObjByKeys(meta.payload, collection.payload),
                id: meta.key
            },
            timestamp: Date.now()
        };
        payloads.push(payload);
    } else {
        const timestamp = Date.now()
        for (const key of meta.keys) {
            let payload: Payload = {
                collection: meta.collection,
                event: isUpdate ? 'update' : 'delete',
                fields: {
                    id: key
                },
                timestamp
            };

            if (isUpdate) {
                const hasMissingFields = Object.keys(payload.fields).length !== collection.payload.filter(k => k !== 'id').length;
                let data = hasMissingFields ? await fetchExistingFieldData(meta, config, eventContext, hookContext) : null;
                
                if (hasMissingFields && data) {
                    const record = data.find(d => d.id === key || (typeof d.id === 'number' && parseInt(key as string) === d.id));
                    if (!record) continue;
                    payload.fields = {
                        ...pruneObjByKeys(record, collection.payload),
                        id: key
                    }
                }
            } else if (isDelete) {
                if (!recordData) return;
                const record = recordData.find(d => d.id === key);
                if (!record) return;
                payload.fields = {
                    ...pruneObjByKeys(record, collection.payload),
                    id: key
                }
            }

            payloads.push(payload);
        }
    }

    if (payloads.length > 0) {
        await sendFlushRequestToEndpoint(url, headers, payloads, logger).catch(() =>
            notifyUsers(meta, config, hookContext, eventContext, 'Cache Flush error')
        );
    }
};
