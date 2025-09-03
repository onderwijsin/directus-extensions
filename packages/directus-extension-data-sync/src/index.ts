import type { PrimaryKey } from "@directus/types";
import type { ActionMeta } from "utils";
import { defineHook } from "@directus/extensions-sdk";
import {
	createOrUpdateCollection,
	createOrUpdateRelationsInCollection,
	disableSchemaChange
} from "utils";
import {
	collectionFieldSchema,
	collectionRelationSchema,
	collectionSchema,
	dataSyncUserSchema,
	junctionFieldSchema,
	junctionRelationSchema,
	junctionSchema
} from "./schema";
import { syncData } from "./sync";
import { } from "./types";
import { assignPolicy, createDataSyncPolicy, createDataSyncUser, fetchRemotes } from "./utils";

const dataSyncUserId = dataSyncUserSchema.id as PrimaryKey;

export default defineHook(({ action, init }, hookContext) => {
	init("cli.after", async () => {
		if (!disableSchemaChange("DATA_SYNC_DISABLE_SCHEMA_CHANGE", hookContext.env)) {
			// Create the policy, user and assign the policy to the user
			// This will be used to authenticate the sync api
			await createDataSyncPolicy(hookContext);
			await createDataSyncUser(hookContext);
			await assignPolicy(hookContext);

			// Create the collections for storing remote config
			await createOrUpdateCollection(
				collectionSchema.collection,
				{
					collectionSchema,
					fieldSchema: collectionFieldSchema
				},
				hookContext
			);

			// Create junction between Directus users and data_sync_remote_sources
			await createOrUpdateCollection(
				junctionSchema.collection,
				{
					collectionSchema: junctionSchema,
					fieldSchema: junctionFieldSchema
				},
				hookContext
			);

			// We need to create the junction relation after the junction collection is created
			await createOrUpdateRelationsInCollection("data_sync_remote_sources", collectionRelationSchema, hookContext);
			await createOrUpdateRelationsInCollection("data_sync_remote_sources_directus_users", junctionRelationSchema, hookContext);
		}
	});

	["items.create", "items.update", "items.delete"].forEach((event) => {
		action(event, async (meta, eventContext) => {
			const config = await fetchRemotes(eventContext, hookContext);
			if (config.filter((remote) => Array.isArray(remote.schema) && remote.schema.find((c) => c.collection === meta.collection)).length === 0) return; // Skip if not a synced collection

			const requestUserId = eventContext.accountability?.user; // Retrieve the user ID of the requestor
			const isRemoteSync = requestUserId === dataSyncUserId;

			// If event was triggered by a remote API key, skip the sync (since that would create an infinite loop)
			if (isRemoteSync) {
				return;
			}

			// Only sync if it was a local change
			await syncData(meta as ActionMeta, config, eventContext, hookContext);
		});
	});
});
