import { ApiExtensionContext } from '@directus/extensions';
import { EventContext, PrimaryKey } from '@directus/types';


/**
 * Creates a notification for a specific event. Maily usefull for notifying users of changes in the system or errors in automations / hooks.
 * 
 * @param payload - The payload containing notification details.
 * @param payload.subject - The subject of the notification.
 * @param payload.userId - The ID of the user to receive the notification.
 * @param payload.collection - The collection related to the notification.
 * @param payload.itemId - The ID of the item related to the notification.
 * @param payload.event - The event type ('create', 'update', 'delete').
 * @param payload.message - Optional custom message for the notification.
 * @param payload.customProps - Optional custom properties to include in the notification.
 * @param eventContext - The event context containing schema information.
 * @param hookContext - The API extension context containing services.
 * 
 * @returns A promise that resolves when the notification is created.
 */
export const createNotifcation = async (
    payload: {
        subject: string
        userId: PrimaryKey
        collection: string
        itemId: PrimaryKey
        event: 'create' | 'update' | 'delete'
        message?: string
        customProps?: Record<string, string | number | boolean>
    },
    eventContext: EventContext ,
    hookContext: ApiExtensionContext
): Promise<void> => {
    const { NotificationsService } = hookContext.services;
    const notifications = new NotificationsService({ 
        schema: eventContext.schema,
        knex: eventContext.database
    });

    const { subject, userId, collection, itemId, event, message: inputMessage, customProps } = payload;

    const message = inputMessage || `
        ${subject}\n\n
        Collection: ${collection}\n\n
        Item ID: ${itemId}\n\n
        Event: ${event}\n\n
        ${customProps ? Object.entries(customProps).map(([key, value]) => `${key}: ${value}`).join('\n\n') : ''}
        Check server logs for detailed information.
    `;

    await notifications.createOne({
        recipient: userId,
        subject,
        message,
        collection: collection,
        item: itemId,
    })
}