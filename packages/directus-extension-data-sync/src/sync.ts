import type { ApiExtensionContext } from "@directus/extensions";
import type { EventContext } from "@directus/types";
import type { ActionMeta, ActionMetaCreate, ActionMetaDelete, ActionMetaUpdate } from "utils";
import type { RemoteConfig } from "./types";
import { ofetch } from "ofetch";
import { createNotifcation, pruneObjByKeys } from "utils";

/**
 * Sends delete requests for each item in the `meta.keys` array.
 *
 * @param meta - Metadata containing collection name and item keys.
 * @param remote - The remote configuration.
 * @param logger - Logging utility.
 */
const syncDelete = async (meta: ActionMetaDelete, remote: RemoteConfig, logger: ApiExtensionContext["logger"]) => {
	for (const key of meta.keys) {
		try {
			await ofetch(`${remote.url}/items/${meta.collection}/${key}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${remote.api_key}` }
			});

			logger.info(`Deleted item ${key} in ${meta.collection} from ${remote.url}`);
		}
		catch (error: any) {
			logger.warn(`Failed to delete item ${key} in ${meta.collection} from ${remote.url}: ${error.message || error}`);
			throw error;
		}
	}
};

/**
 * Sends a create or update request with a pruned payload based on configuration.
 *
 * @param meta - Metadata containing collection name, item key, and payload.
 * @param remote - The remote configuration.
 * @param fields - Fields to sync.
 * @param logger - Logging utility.
 */
const syncCreateOrUpdate = async (
	meta: ActionMetaCreate | ActionMetaUpdate,
	remote: RemoteConfig,
	fields: string[],
	logger: ApiExtensionContext["logger"]
) => {
	const isCreateEvent = meta.event === "items.create";
	const method = isCreateEvent ? "POST" : "PATCH";

	const prunedPayload = pruneObjByKeys(meta.payload, fields);
	if (!isCreateEvent && Object.keys(prunedPayload).length === 0) return; // No sync needed

	const payload = isCreateEvent ? { id: meta.key, ...prunedPayload } : prunedPayload;
	const items = isCreateEvent ? [meta.key] : meta.keys;

	// We need to sent individual requests for each item, to minimize the risk of loss of synchronization
	for (const key of items) {
		let url = `${remote.url}/items/${meta.collection}`;
		if (!isCreateEvent) url += `/${key}`;

		await ofetch(url, {
			method,
			headers: { Authorization: `Bearer ${remote.api_key}` },
			body: payload
		});

		logger.info(`${isCreateEvent ? "Created" : "Updated"} item ${key} in ${meta.collection} on ${remote.url}`);
	}
};

/**
 * Notifies users in case of an error or misconfiguration.
 *
 * @param remote - The remote configuration.
 * @param meta - Metadata containing collection name and item key(s).
 * @param subject - Notification subject.
 * @param eventContext - Directus event context.
 * @param hookContext - API context.
 */
const notifyUsers = async (
	remote: RemoteConfig,
	meta: ActionMeta,
	subject: string,
	eventContext: EventContext,
	hookContext: ApiExtensionContext
) => {
	for (const userId of remote.users_notification) {
		await createNotifcation({
			collection: meta.collection,
			userId,
			itemId: "key" in meta ? meta.key : meta.keys.join(", "),
			event: meta.event.split(".")[1] as "create" | "update" | "delete",
			subject,
			customProps: { remote: remote.url }
		}, eventContext, hookContext);
	}
};

/**
 * Syncs data changes to configured remote instances.
 *
 * @param meta - Metadata about the triggered event (collection, keys, event type, etc.).
 * @param config - Array of remote instances and their sync configurations.
 * @param eventContext - Context of the Directus event that triggered the sync.
 * @param hookContext - API context including logging utilities.
 */
export const syncData = async (
	meta: ActionMeta,
	config: RemoteConfig[],
	eventContext: EventContext,
	hookContext: ApiExtensionContext
) => {
	const { logger } = hookContext;

	for (const remote of config) {
		// Validate schema configuration
		if (!remote.schema) {
			const message = `Remote schema is not properly configured for ${remote.url}. Please check the schema configuration in the data_sync_remote_sources collection. Until you fix the schema, the Data Sync extension will not work for this remote.`;
			logger.warn(message);

			for (const userId of remote.users_notification) {
				await createNotifcation({
					collection: meta.collection,
					userId,
					itemId: "key" in meta ? meta.key : meta.keys.join(", "),
					event: meta.event.split(".")[1] as "create" | "update" | "delete",
					subject: "Data Sync Schema error",
					message,
					customProps: {
						remote: remote.url
					}
				}, eventContext, hookContext);
			}

			return;
		}

		// Check if collection is included in this remote
		const collection = remote.schema.find((c) => c.collection === meta.collection);
		if (!collection) continue;

		try {
			await (meta.event === "items.delete"
				? syncDelete(meta, remote, logger)
				: syncCreateOrUpdate(
						meta,
						remote,
						collection.fields,
						logger
					));
		}
		catch (error: any) {
			logger.warn(`Sync error for ${remote.url}: ${error?.message || error}`);
			await notifyUsers(remote, meta, "Sync error", eventContext, hookContext);
		}
	}
};
