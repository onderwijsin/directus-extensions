import { PrimaryKey } from '@directus/types';

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

export interface BaseRemoteConfig {
    id: PrimaryKey
    status: 'published' | 'draft' | 'archived'
    url: string
    api_key: string
    schema: Record<string, any>[] | null
}

export interface RawRemoteConfig extends BaseRemoteConfig {
    users_notification: {
        directus_users_id: string
    }[]
}

export interface RemoteConfig extends BaseRemoteConfig {
    users_notification: string[]
}