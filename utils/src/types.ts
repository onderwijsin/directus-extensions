import type { PrimaryKey } from "@directus/types";

interface BaseMetaCreate {
	event: "items.create";
	collection: string;
}
interface BaseMetaUpdate {
	event: "items.update";
	collection: string;
	keys: PrimaryKey[];
} // Note that keys are NOT of type PrimaryKey. They get converted to string[] by Directus
interface BaseMetaDelete {
	event: "items.delete";
	collection: string;
}

export type FilterMetaCreate = BaseMetaCreate;
export interface ActionMetaCreate extends BaseMetaCreate {
	payload: Record<string, any>;
	key: PrimaryKey;
}

;

export type FilterMetaUpdate = BaseMetaUpdate;
export interface ActionMetaUpdate extends BaseMetaUpdate {
	payload: Record<string, any>;
}

;

export type FilterMetaDelete = BaseMetaDelete;
export interface ActionMetaDelete extends BaseMetaDelete {
	keys: PrimaryKey[];
	payload: PrimaryKey[];
}

;

export type FilterMeta = FilterMetaCreate | FilterMetaUpdate | FilterMetaDelete;
export type ActionMeta = ActionMetaCreate | ActionMetaUpdate | ActionMetaDelete;
