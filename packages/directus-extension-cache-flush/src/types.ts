import { PrimaryKey } from '@directus/types';

export type EventKey = 'create' | 'update' | 'delete';
export type Meta = MetaCreate | MetaUpdate | MetaDelete;

type MetaCreate = {
    event: 'items.create';
    payload: Record<string, any>;
    key: PrimaryKey;
    collection: string;
};

type MetaUpdate = {
    event: 'items.update';
    payload: Record<string, any>;
    keys: PrimaryKey[];
    collection: string;
};

type MetaDelete = {
    event: 'items.delete';
    keys: PrimaryKey[];
    collection: string;
};

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
        fields: string[]
    }> | null
}