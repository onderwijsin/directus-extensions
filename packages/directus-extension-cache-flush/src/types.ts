import { PrimaryKey } from '@directus/types';

export type EventKey = 'create' | 'update' | 'delete';

export interface BaseFlushConfig {
    id: PrimaryKey
    status: 'published' | 'draft' | 'archived'
    url: string
    api_key: string | null
    auth_header: 'bearer' | 'api-key' | 'no-auth' | string
    schema: Record<string, any>[] | null
}

export interface RawFlushConfig extends BaseFlushConfig {
    users_notification: {
        directus_users_id: string
    }[]
}

export interface FlushConfig extends BaseFlushConfig {
    users_notification: string[]
    schema: Array<{
        collection: string
        events: Array<EventKey>
        payload: string[]
    }> | null
}


export type RecordData = Array<Record<string, any> & { id: PrimaryKey }>

export type Payload = {
    collection: string;
    event: EventKey;
    fields: Record<string, any> & { id: PrimaryKey };
    timestamp: number;
}