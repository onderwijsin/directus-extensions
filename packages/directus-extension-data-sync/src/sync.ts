import { ApiExtensionContext } from '@directus/extensions';
import type { Meta, RemoteConfig } from './types';
import { prunePayload } from './utils';
import { ofetch } from 'ofetch';
import { EventContext, PrimaryKey } from '@directus/types';

const handleNotifications = async (
    error: {
        collection: string,
        itemId: PrimaryKey,
        event: 'create' | 'update' | 'delete',
        remote: string,
        message?: string
    },
    config: {
        users_notification: string[]
    }, 
    eventContext: EventContext ,
    hookContext: ApiExtensionContext
) => {
    if (!config) return

    if (!!config.users_notification?.length) {
        // Send Directus native notification to lister users
        const { NotificationsService } = hookContext.services;
        const notifications = new NotificationsService({ 
            schema: eventContext.schema
        });


        const message = error.message || `
        The Data Sync Extension encountered an error!\n\n
        Collection: ${error.collection}\n\n
        Item ID: ${error.itemId}\n\n
        Event: ${error.event}\n\n
        Remote: ${error.remote}.\n\n
        Check server logs for detailed error information.
        `;

        for (const userId of config.users_notification) {
            await notifications.createOne({
                recipient: userId,
                subject: 'Data Sync Error',
                message,
                collection: error.collection,
                item: error.itemId,
            })
        }
    }
}

export const syncData = async (
    meta: Meta, 
    config: RemoteConfig[],
    eventContext: EventContext ,
    hookContext: ApiExtensionContext
) => {
    const { logger } = hookContext;
    // Loop over remotes and check wheter the collection is synced for a specific remote
    for (const remote of config) {
        if (!Array.isArray(remote.schema) || remote.schema.some(c => !c.name || !c.fields.every((field: unknown) => !!field && typeof field === 'string'))) {
            logger.warn('Remote schema is not properly configured. Please check the schema configuration in the remote_data_sources collection. Until you fix the schema, the Data Sync extension will not work for this remote.')
            await handleNotifications({
                collection: meta.collection,
                itemId: 'key' in meta ? meta.key : meta.keys.join(', '),
                event: meta.event.split('.')[1] as 'create' | 'update' | 'delete',
                remote: remote.url,
                message: 'Remote schema is not properly configured. Please check the schema configuration in the remote_data_sources collection. Until you fix the schema, the Data Sync extension will not work for this remote.'
            }, { users_notification: remote.users_notification}, eventContext, hookContext)
            return
        };

        const collection = remote.schema.find(c => c.name === meta.collection);
        if (!collection) return 

        // Determine the action type; this result in different operation logic
        if (meta.event === 'items.delete') {
            // If delete; send delete request to all remotes with primary keys
            /* NOTE
                A batch delete only works if all IDs are present in the remote database.
                This should always be the case, but for redundancy, we will send
                individual delete requests for each item.
            */

            for (const key of meta.keys) {
                try {
                    await ofetch(`${remote.url}/items/${meta.collection}/${key}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + remote.api_key
                        },
                    }).then(() => {
                        logger.info('Succesfully synced deleted item in remote: ' + remote.url + ' with id: ' + key + 'in collection: ' + meta.collection);
                    })
                } catch (error: any) {
                    logger.warn('Error deleting in remote: ' + remote.url + ' with id: ' + key + 'in collection: ' + meta.collection);
                    if (error?.message) logger.warn(error.message)
                    else logger.warn(error)

                    // Send notifications
                    await handleNotifications({
                        collection: meta.collection,
                        itemId: key,
                        event: 'delete',
                        remote: remote.url
                    }, { users_notification: remote.users_notification }, eventContext, hookContext)
                }
            }
    
        } else if (meta.event === 'items.create') {
                logger.info('Syncing created item to remote: ' + remote.url);
                const prunedPayload = prunePayload(meta.payload, collection.fields);


                /* NOTE
                    Even if the pruned payload does not have any keys (which is unlikely on a create event, but possible),
                    we still want to send a request to the remote to keep the IDs in sync between instances.
                    This means that update events of fields that ARE synced, will go through.

                    This is fine, since an empty pruned payload means that none of the synced fields are required
                */
            
                // Add ID to payload to keep IDs between instances in sync
                const payload = {
                    id: meta.key,
                    ...prunedPayload
                }
    
                try {
                    await ofetch(remote.url + '/items/' + meta.collection, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + remote.api_key
                        },
                        body: payload
                    }).then(() => {
                        logger.info('Succesfully synced created item to remote: ' + remote.url + ' with id: ' + meta.key + 'in collection: ' + meta.collection);
                    })
                } catch (error: any) {
                    logger.warn('Error creating in remote: ' + remote.url + ' with id: ' + meta.key + 'in collection: ' + meta.collection);
                    if (error?.message) logger.warn(error.message)
                    else logger.warn(error)

                    // Send notifications
                    await handleNotifications({
                        collection: meta.collection,
                        itemId: meta.key,
                        event: 'delete',
                        remote: remote.url
                    }, { users_notification: remote.users_notification }, eventContext, hookContext)
                }
        } else {
            // Send update event

            /* NOTE
                A batch update only works if all IDs are present in the remote database.
                This should always be the case, but for redundancy, we will send
                individual requests for each item.
            */
            const prunedPayload = prunePayload(meta.payload, collection.fields);

            // If the pruned payload is empty, we do not want to send a request to the remote
            // since none of the sync fields are changed
            if (!Object.keys(prunedPayload).length) return;

            for (const key of meta.keys) {
                try {
                    await ofetch(`${remote.url}/items/${meta.collection}/${key}`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': 'Bearer ' + remote.api_key
                        },
                        body: prunedPayload
                    }).then(() => {
                        logger.info('Succesfully synced updated item in remote: ' + remote.url + ' with id: ' + key + 'in collection: ' + meta.collection);
                    })
                } catch (error: any) {
                    logger.warn('Error updating in remote: ' + remote.url + ' with id: ' + key + 'in collection: ' + meta.collection);
                    if (error?.message) logger.warn(error.message)
                    else logger.warn(error)

                    await handleNotifications({
                        collection: meta.collection,
                        itemId: key,
                        event: 'delete',
                        remote: remote.url
                    }, { users_notification: remote.users_notification }, eventContext, hookContext)
                }
            }
        }
    }
}