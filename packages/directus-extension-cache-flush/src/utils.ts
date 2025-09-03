import type { ApiExtensionContext } from "@directus/extensions";
import type { EventContext } from "@directus/types";
import type { ActionMetaDelete, ActionMetaUpdate } from "utils";
import type { FlushConfig, RawFlushConfig, RecordData } from "./types";
import { createNotifcation } from "utils";
import { z } from "zod";

const schemaValidator = z.array(
	z.object({
		collection: z.string(),
		events: z.array(z.enum(["create", "update", "delete"])),
		payload: z.array(z.string())
	})
);

/**
 * Validates the provided schema to ensure it meets the required structure.
 *
 * @param schema - The schema to validate. It should be an array of objects, each containing
 *                 `collection`, `events`, and `payload` properties.
 * @param logger - The logger from hookContext to use for logging validation errors.
 * @returns a boolean indicating whether the schema is valid.
 *
 * The schema is considered valid if:
 * - It is an array.
 * - Each object in the array has `collection`, `events`, and `fields` properties.
 * - `events` and `fields` are arrays.
 * - `events` contains only 'create', 'update', or 'delete' strings.
 * - `fields` contains only strings.
 * - `collection` is a string.
 */
export const validateSchema = (schema: Record<string, any>[] | null, logger: ApiExtensionContext["logger"]): boolean => {
	const result = schemaValidator.safeParse(schema);

	if (!result.success) {
		logger.warn("Schema validation errors:", result.error.issues.map((e) => e.message));
		return false;
	}

	return true;
};

export const fetchCacheFlushConfig = async (eventContext: EventContext, context: ApiExtensionContext): Promise<FlushConfig[]> => {
	const { ItemsService } = context.services;
	const items = new ItemsService("cache_flush_targets", {
		schema: eventContext.schema || await context.getSchema(),
		knex: eventContext.database
	});
	const targets = await items.readByQuery({
		filter: {
			status: {
				_eq: "published"
			}
		},
		fields: [
			"id",
			"url",
			"api_key",
			"auth_header",
			"status",
			"schema",
			"users_notification.directus_users_id"
		]
	}) as RawFlushConfig[];

	return targets.map((remote: RawFlushConfig): FlushConfig => {
		return {
			id: remote.id,
			status: remote.status,
			url: remote.url,
			api_key: remote.api_key,
			auth_header: remote.auth_header,
			schema: validateSchema(remote.schema, context.logger) ? remote.schema : null,
			users_notification: remote.users_notification.map((user) => user.directus_users_id)
		};
	});
};

/**
 * Fetches additional fields for the given meta data.
 *
 * @param meta - The meta data for the update or delete operation.
 * @param config - The cache flush configuration.
 * @param eventContext - The event context.
 * @param hookContext - The hook context.
 * @returns The additional fields if they could be fetched, otherwise `null`.
 */
export const fetchExistingFieldData = async (
	meta: ActionMetaUpdate | ActionMetaDelete,
	config: FlushConfig,
	eventContext: EventContext,
	hookContext: ApiExtensionContext
): Promise<RecordData | null> => {
	const { ItemsService } = hookContext.services;
	const items = new ItemsService(meta.collection, {
		schema: eventContext.schema || await hookContext.getSchema(),
		knex: eventContext.database
	});

	const { url, schema } = config;

	if (!schema) return null;
	const collection = schema.find((c) => c.collection === meta.collection);
	if (!collection) return null;

	try {
		const data = await items.readMany(meta.keys, {
			fields: collection.payload.includes("id") ? collection.payload : ["id", ...collection.payload]
		}) as RecordData;

		return data;
	}
	catch (error: any) {
		hookContext.logger.warn(`Error fetching additional fields for cache flush to: ${url} with id: ${meta.keys.join(", ")}in collection: ${meta.collection}`);
		if (error?.message) hookContext.logger.warn(error.message);

		for (const userId of config.users_notification) {
			await createNotifcation({
				collection: meta.collection,
				userId,
				itemId: meta.keys.join(", "),
				event: meta.event.split(".")[1] as "create" | "update" | "delete",
				subject: "Cache Flush Schema error",
				message: "Error fetching additional fields for cache flush. This is most likely due to a schema misconfiguration. Please check the schema configuration in the cache_flush_targets collection. Until you fix the schema, the Cache Flush extension will not work for this target.",
				customProps: {
					url: config.url
				}
			}, eventContext, hookContext);
		}

		return null;
	}
};
