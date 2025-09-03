import type { ApiExtensionContext } from "@directus/extensions";
import type { EventContext } from "@directus/types";
import type { RawRemoteConfig, RemoteConfig, Schema } from "./types";
import { createError } from "@directus/errors";
import { checkIfItemExists, safeSchemaChangesOnStartup } from "utils";
import { z } from "zod";
import { dataSyncAccessSchema, dataSyncPolicySchema, dataSyncUserSchema } from "./schema";

const CreateItemFromSchemaError = createError(
	"EXTENSION_LOAD_ERROR",
	(message: string) => message,
	500
);

const createItemIfNotExists = async (
	context: ApiExtensionContext,
	serviceKey: "PoliciesService" | "UsersService" | "AccessService",
	schema: Record<string, any> & { id: string },
	errorMessage: string
) => {
	await safeSchemaChangesOnStartup(async (context: ApiExtensionContext) => {
		const serviceInstance = new context.services[serviceKey]({
			schema: await context.getSchema(),
			knex: context.database
		});

		const itemAlreadyExists = await checkIfItemExists(async () => await serviceInstance.readOne(schema.id));

		if (!itemAlreadyExists) {
			try {
				await serviceInstance.createOne(schema);
			}
			catch {
				throw new CreateItemFromSchemaError(errorMessage);
			}
		}
	}, [context]);
};

export const createDataSyncPolicy = async (context: ApiExtensionContext) => {
	await createItemIfNotExists(
		context,
		"PoliciesService",
		dataSyncPolicySchema,
		"Error creating policy from the Data Sync extension"
	);
};

export const createDataSyncUser = async (context: ApiExtensionContext) => {
	await createItemIfNotExists(
		context,
		"UsersService",
		dataSyncUserSchema,
		"Error creating user from the Data Sync extension"
	);
};

export const assignPolicy = async (context: ApiExtensionContext) => {
	await createItemIfNotExists(
		context,
		"AccessService",
		dataSyncAccessSchema,
		"Error creating access relation from the Data Sync extension"
	);
};

const schemaValidator = z.array(
	z.object({
		collection: z.string(),
		fields: z.array(z.string())
	})
);

/**
 * Validates the provided schema to ensure it meets the required structure.
 *
 * @param schema - The schema to validate. It should be an array of objects, each containing
 *                 `collection`, and `fields` properties.
 * @param logger - The logger from hookContext to use for logging validation errors.
 * @returns a boolean indicating whether the schema is valid.
 *
 * The schema is considered valid if:
 * - It is an array.
 * - Each object in the array has `collection` and `fields` properties.
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

export const fetchRemotes = async (eventContext: EventContext, context: ApiExtensionContext): Promise<RemoteConfig[]> => {
	const { ItemsService } = context.services;
	const items = new ItemsService("data_sync_remote_sources", {
		schema: eventContext.schema || await context.getSchema(),
		knex: eventContext.database
	});

	const remotes = await items.readByQuery({
		filter: {
			status: {
				_eq: "published"
			}
		},
		fields: [
			"id",
			"url",
			"api_key",
			"status",
			"schema",
			"users_notification.directus_users_id"
		]
	}) as RawRemoteConfig[];

	return remotes.map((remote: RawRemoteConfig) => {
		return {
			id: remote.id,
			status: remote.status,
			url: remote.url,
			api_key: remote.api_key,
			schema: validateSchema(remote.schema, context.logger) ? remote.schema as Schema : null,
			users_notification: remote.users_notification.map((user) => user.directus_users_id)
		};
	}) as RemoteConfig[];
};
