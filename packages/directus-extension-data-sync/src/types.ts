import { PrimaryKey } from '@directus/types';
export type { SyncConfig } from './config';

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