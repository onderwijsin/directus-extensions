import { PrimaryKey } from '@directus/types'

export type HookMeta = HookMetaCreate | HookMetaUpdate | HookMetaDelete;

export type HookMetaCreate = {
    event: 'items.create';
    payload: Record<string, any>;
    key: PrimaryKey;
    collection: string;
};

export type HookMetaUpdate = {
    event: 'items.update';
    payload: Record<string, any>;
    keys: PrimaryKey[];
    collection: string;
};

export type HookMetaDelete = {
    event: 'items.delete';
    keys: PrimaryKey[];
    collection: string;
};