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
 * @param payload - The data payload for the request.
 * @param logger - Logger for recording success or failure.
 * @param meta - Metadata associated with the event.
 * @param key - Identifier of the item being flushed.
 */
const sendFlushRequestToEndpoint = async (
    url: string,
    headers: Record<string, string>,
    payload: any,
    logger: any,
    meta: ActionMeta,
    key: PrimaryKey
) => {
    try {
        await ofetch(url, {
            method: 'POST',
            headers,
            body: payload
        });
        logger.info(`Successfully sent cache flush to: ${url} with id: ${key} in collection: ${meta.collection}`);
    } catch (error: any) {
        logger.warn(`Error sending cache flush to: ${url} with id: ${key} in collection: ${meta.collection}`);
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
export const sendFlushRequest = async (
    meta: ActionMeta,
    config: FlushConfig, 
    eventContext: EventContext, 
    hookContext: ApiExtensionContext,
    recordData?: RecordData
) => {
    const { logger } = hookContext;

    // Ensure schema is configured correctly
    if (!config.schema) {
        const message = 'Schema is not properly configured. Please check the schema configuration in the cache_flush_targets collection. Until you fix the schema, the Cache Flush extension will not work for this target.';
        logger.warn(message);
        await notifyUsers(meta, config, hookContext, eventContext, 'Cache Flush Schema error', message);
        return;
    }

    // Extract target configuration
    const { url, auth_header, api_key, schema } = config;
    const collection = schema.find(c => c.collection === meta.collection);
    if (!collection) return;

    // Set up authentication headers
    const headers = {
        [auth_header === 'bearer' ? "Authorization" : auth_header === 'api-key' ? 'Api-Key' : auth_header]: 
        auth_header === 'bearer' ? `Bearer ${api_key}` : api_key || ''
    };

    // Determine event type
    const isCreate = meta.event === 'items.create';
    const isUpdate = meta.event === 'items.update';
    const isDelete = meta.event === 'items.delete';

    // Base payload structure
    let payload: Payload = {
        collection: meta.collection,
        event: isCreate ? 'create' : isUpdate ? 'update' : 'delete',
        fields: {},
        timestamp: Date.now()
    };

    if (isCreate) {
        // Process create event: prune payload and include primary key if available
        payload.fields = pruneObjByKeys(meta.payload, collection.payload);
        if ('id' in collection.payload) {
            payload.fields['id'] = meta.key;
        }

        await sendFlushRequestToEndpoint(url, headers, payload, logger, meta, meta.key).catch(() =>
            notifyUsers(meta, config, hookContext, eventContext, 'Cache Flush error')
        );
    } else {
        // Process update or delete event
        for (const key of meta.keys) {
            if ('id' in collection.payload) {
                payload.fields['id'] = key;
            }

            if (isUpdate) {
                // Ensure all required fields are present
                const hasMissingFields = Object.keys(payload.fields).length !== collection.payload.filter(k => k !== 'id').length;
                let data = hasMissingFields ? await fetchExistingFieldData(meta, config, eventContext, hookContext) : null;
                
                if (hasMissingFields && data) {
                    const record = data.find(d => d.id === key || (typeof d.id === 'number' && parseInt(key as string) === d.id));
                    if (!record) continue;
                    payload.fields = pruneObjByKeys(record, collection.payload);
                }
            } else if (isDelete) {
                // Ensure the record exists before sending a delete request
                if (!recordData) return;
                const record = recordData.find(d => d.id === key);
                if (!record) return;
                payload.fields = pruneObjByKeys(record, collection.payload);
            }

            await sendFlushRequestToEndpoint(url, headers, payload, logger, meta, key).catch(() =>
                notifyUsers(meta, config, hookContext, eventContext, 'Cache Flush error')
            );
        }
    }
};