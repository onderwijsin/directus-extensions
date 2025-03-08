import { PrimaryKey } from '@directus/types';

export interface BaseRemoteConfig {
    id: PrimaryKey
    status: 'published' | 'draft' | 'archived'
    url: string
    api_key: string
    
}

export type Schema = Array<{
    collection: string
    fields: string[]
}>

export interface RawRemoteConfig extends BaseRemoteConfig {
    schema: any
    users_notification: {
        directus_users_id: string
    }[]
}

export interface RemoteConfig extends BaseRemoteConfig {
    users_notification: string[]
    schema: Schema | null
}