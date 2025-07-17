import type { ItemsService } from "@directus/api/dist/services";
import type { HookExtensionContext } from "@directus/extensions";
import type { EventContext, PrimaryKey } from "@directus/types";

/**
 * Prevents infinite redirect loops by deleting redirects with the specified destination.
 *
 * @param destination - The destination URL to check for infinite loops.
 * @param collection - The name of the collection.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves when the operation is complete.
 */
export const preventInfiniteLoop = async (
	destination: string,
	collection: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<void> => {
	const { ItemsService } = hookContext.services;
	const redirects: ItemsService = new ItemsService(collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});
	redirects.deleteByQuery({ filter: { origin: { _eq: destination } } });
};

/**
 * Recursively retrieves redirect IDs by destination.
 *
 * @param value - The destination value(s) to search for.
 * @param collection - The name of the collection.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves to an array of primary keys.
 */
export const recursivelyGetRedirectIDsByDestination = async (
	value: string | string[],
	collection: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<PrimaryKey[]> => {
	const { ItemsService } = hookContext.services;
	const items: ItemsService = new ItemsService(collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});

	if (!Array.isArray(value)) value = [value];

	const data = await items.readByQuery({
		filter: {
			destination: {
				_in: value
			}
		},
		fields: ["id", "origin"]
	});

	if (data.length === 0) return [];

	const nestedData = await recursivelyGetRedirectIDsByDestination(data.map((item) => item.origin), collection, eventContext, hookContext);

	return [...data.map((item) => item.id), ...nestedData];
};

/**
 * Checks existing redirect against a partial payload to prevent duplicate redirects.
 *
 * @param field - The field to check for existing redirects.
 * @param payload - The payload to check.
 * @param meta - The metadata object.
 * @param eventContext - The event context object
 * @param hookContext - The hook's context object
 * @returns A promise that resolves to a boolean indicating whether the redirect exists.
 */
const checkExitsingRedirects = async (
	field: "destination" | "origin",
	payload: Record<string, any>,
	meta: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<boolean> => {
	const { ItemsService } = hookContext.services;
	const items: ItemsService = new ItemsService(meta.collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});

	const redirects = await items.readMany(meta.keys, { fields: [field] });

	if (redirects.some((redirect) => redirect[field] === payload[field === "destination" ? "origin" : "destination"])) {
		return true;
	}

	return false;
};

export const validateRedirect = async (
	payload: Record<string, any>,
	meta: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<boolean> => {
	if (
		Object.prototype.hasOwnProperty.call(payload, "origin")
		&& Object.prototype.hasOwnProperty.call(payload, "destination")
		&& payload.origin === payload.destination
	) {
		return false;
	}
	else if (
		Object.prototype.hasOwnProperty.call(payload, "origin")
		&& meta.event.includes(".update")
	) {
		return !(await checkExitsingRedirects("destination", payload, meta, eventContext, hookContext));
	}
	else if (
		Object.prototype.hasOwnProperty.call(payload, "destination")
		&& meta.event.includes(".update")
	) {
		return !(await checkExitsingRedirects("origin", payload, meta, eventContext, hookContext));
	}

	return true;
};
