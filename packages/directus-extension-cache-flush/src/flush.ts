import { ofetch } from 'ofetch';
import { EventContext, PrimaryKey } from '@directus/types';
import { ApiExtensionContext } from '@directus/extensions';
import type { Meta, FlushConfig, RecordData } from './types';
import { createNotifcation, pruneObjByKeys } from 'utils';
import { fetchExistingFieldData } from './utils';

export const sendFlushRequest = async (
    meta: Meta,
    config: FlushConfig, 
    eventContext: EventContext, 
    hookContext: ApiExtensionContext,
    recordData?: RecordData
) => {
    /*
        0. Notify user if invalid schema 
        1. Loop over endpoints, and for each:
            - find variable for unique identifier
            - sent post request to endpoint with unique identifier
        2. Log success/failure
        3. If failure, sent notification to registered user
    */
    const { logger } = hookContext;
    if (!config.schema) {
        const message = 'Schema is not properly configured. Please check the schema configuration in the cache_flush_targets collection. Until you fix the schema, the Cache Flush extension will not work for this target.'
        logger.warn(message)
        for (const userId of config.users_notification) {
            await createNotifcation({
                collection: meta.collection,
                userId,
                itemId: 'key' in meta ? meta.key : meta.keys.join(', '),
                event: meta.event.split('.')[1] as 'create' | 'update' | 'delete',
                subject: 'Cache Flush Schema error',
                message: message,
                customProps: {
                    url: config.url
                }
            }, eventContext, hookContext)
        }
        return
    };

    const { url, auth_header, api_key, schema } = config;
    const collection = schema.find(c => c.collection === meta.collection);
    if (!collection) return 

    const headers = {
        [auth_header === 'bearer' ? "Authorization" : auth_header === 'api-key' ? 'Api-Key' : auth_header]: auth_header === 'bearer' ? 'Bearer ' + api_key : !!api_key ? api_key : ''
    }

    // Determine the action type; this result in different operation logic
    if (meta.event === 'items.create') {
        // Create payload to send to cache flush endpoint
        let payload = {
            collection: meta.collection,
            event: 'create',
            fields: pruneObjByKeys(meta.payload, collection.payload),
            timestamp: Date.now()
        }

        if ('id' in collection.payload) {
            payload.fields['id'] = meta.key;
        }

        try {
            await ofetch(url, {
                method: 'POST',
                headers: auth_header !== 'no-auth' ? headers : undefined,
                body: payload
            }).then(() => {
                logger.info('Succesfully sent cache flush to: ' + url + ' with id: ' + meta.key + 'in collection: ' + meta.collection);
            })
        } catch (error: any) {
            logger.warn('Error sending cache flush to: ' + url + ' with id: ' + meta.key + 'in collection: ' + meta.collection);
            if (error?.message) logger.warn(error.message)
            else logger.warn(error)

            // Send notifications
            for (const userId of config.users_notification) {
                await createNotifcation({
                    collection: meta.collection,
                    userId,
                    itemId: meta.key,
                    event: 'create',
                    subject: 'Cache Flush error',
                    customProps: {
                        url: config.url
                    }
                }, eventContext, hookContext)
            }
           
        }
    } else if (meta.event === 'items.update') {
        // Pretty similar to create, except for:
        // meta.keys is array of keys
        // The payload might not consist of all fields we need. In that case we need to fetch additional fields

        // Create payload to send to cache flush endpoint
        let payload = {
            collection: meta.collection,
            event: 'update',
            fields: pruneObjByKeys(meta.payload, collection.payload),
            timestamp: Date.now()
        }

        let data: Array<Record<string, any> & { id: PrimaryKey }> | null = null

        // Filter ID from payload, since this should not be part of comparison (it will be added later)
        const hasMissingFields = Object.keys(payload.fields).length !== collection.payload.filter(k => k !== 'id').length

        // Check if the update payload contains all needed fields. If not, fetch the missing fields
        if (hasMissingFields) {
            data = await fetchExistingFieldData(meta, config, eventContext, hookContext)
        }

        // We still need to sent individual requests for each item, since the payload.fields will not be equal for each
        // We could sent it in a batch, but that requires additoinal logic and endpoints in the front end

        for (const key of meta.keys) {
            if ('id' in collection.payload) {
                payload.fields['id'] = key;
            }

            // If the payload had missing fields, add them from the fetched data
            if (hasMissingFields) {
                if (!data) return
                // Directus converts integer ids to strings...
                const record = data.find(d => d.id === key || typeof d.id === 'number' && typeof key === 'string' ? parseInt(key as string) === d.id : false)
                if (!record) return
                payload.fields = pruneObjByKeys(record, collection.payload)
            }

            try {
                await ofetch(url, {
                    method: 'POST',
                    headers: auth_header !== 'no-auth' ? headers : undefined,
                    body: payload
                }).then(() => {
                    logger.info('Succesfully sent cache flush to: ' + url + ' with id: ' + key + 'in collection: ' + meta.collection);
                })
            } catch (error: any) {
                logger.warn('Error sending cache flush to: ' + url + ' with id: ' + key + 'in collection: ' + meta.collection);
                if (error?.message) logger.warn(error.message)
                else logger.warn(error)
    
                // Send notifications
                for (const userId of config.users_notification) {
                    await createNotifcation({
                        collection: meta.collection,
                        userId,
                        itemId: key,
                        event: 'update',
                        subject: 'Cache Flush error',
                        customProps: {
                            url: config.url
                        }
                    }, eventContext, hookContext)
                }
               
            }

        }
    } else if (meta.event === 'items.delete') {
        // Pretty similar to update, except for the fact that the data is already present in recordData

        let payload = {
            collection: meta.collection,
            event: 'delete',
            fields: {} as Record<string, any>,
            timestamp: Date.now()
        }

        for (const key of meta.keys) {
            if ('id' in collection.payload) {
                payload.fields['id'] = key;
            }

            // Populate payload with proper data
            if (!recordData) return
            const record = recordData.find(d => d.id === key)
            if (!record) return
            payload.fields = pruneObjByKeys(record, collection.payload)

            try {
                await ofetch(url, {
                    method: 'POST',
                    headers: auth_header !== 'no-auth' ? headers : undefined,
                    body: payload
                }).then(() => {
                    logger.info('Succesfully sent cache flush to: ' + url + ' with id: ' + key + 'in collection: ' + meta.collection);
                })
            } catch (error: any) {
                logger.warn('Error sending cache flush to: ' + url + ' with id: ' + key + 'in collection: ' + meta.collection);
                if (error?.message) logger.warn(error.message)
                else logger.warn(error)
    
                // Send notifications
                for (const userId of config.users_notification) {
                    await createNotifcation({
                        collection: meta.collection,
                        userId,
                        itemId: key,
                        event: 'delete',
                        subject: 'Cache Flush error',
                        customProps: {
                            url: config.url
                        }
                    }, eventContext, hookContext)
                }
               
            }

        }
    }
}