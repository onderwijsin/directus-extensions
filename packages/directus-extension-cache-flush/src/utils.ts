
import type { ApiExtensionContext } from '@directus/extensions';
import { FlushConfig, RawFlushConfig } from './types';
import { ItemsService } from '@directus/api/dist/services';

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
    if (!schema || !Array.isArray(schema)) return null;
    const isValid = schema.every(({ collection, events, fields }) => {
        if (!collection || !events || !fields) return false;
        if (!Array.isArray(events) || !Array.isArray(fields)) return false;
        if (!events.every(event => ['create', 'update', 'delete'].includes(event))) return false;
        if (!fields.every(field => typeof field === 'string')) return false;
        return typeof collection === 'string';
    });
    return isValid ? schema as FlushConfig['schema'] : null;
}


export const fetchCacheFlushConfig = async (context: ApiExtensionContext): Promise<FlushConfig[]> => {
    const { ItemsService } = context.services
    const items: ItemsService = new ItemsService('cache_flush_targets', {
        schema: await context.getSchema()
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