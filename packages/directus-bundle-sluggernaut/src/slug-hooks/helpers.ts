import type { CollectionsService, FieldsService, ItemsService } from "@directus/api/dist/services";
import type { HookExtensionContext } from "@directus/extensions";
import type { CollectionMeta, EventContext, Field, FieldMeta, PrimaryKey } from "@directus/types";

import { createError } from "@directus/errors";
import slugify from "slugify";
import { getPathString, getSluggernautSettings } from "../shared/utils";
import { extensions, publishedValues } from "./constants";

slugify.extend(extensions);

interface Options {
	fields: string[];
	output_key: string;
	locale?: string;
	make_unique?: boolean;
	lowercase?: boolean;
}

/**
 * Generates a random string of the specified length.
 * @param length - The length of the random string.
 * @returns A random string of the specified length.
 */
function randomString(length: number): string {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";

	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * characters.length));
	}

	return result;
}

const EditMultipleError = createError(
	"INVALID_PAYLOAD_ERROR",
	"Editing multiple items of a collection with multiple slug input fields, without providing each input, is not supported. Please edit one item at a time.",
	400
);

const EditWithMultipleParentsError = createError(
	"INVALID_PAYLOAD_ERROR",
	"Editing multiple items of a collection with different parents, is not supported. Please edit one item at a time.",
	400
);

export const EditMultipleParentsError = createError(
	"INVALID_PAYLOAD_ERROR",
	"You can not assign multiple new parents simultaneous, where the item's path depends on the parent. Please edit one item at a time.",
	400
);

export const EditMultipleParentsChildrenError = createError(
	"INVALID_PAYLOAD_ERROR",
	"You can not assign new children for multiple parents simultaneous, where the item's path depends on the parent. Please edit one item at a time.",
	400
);

export const RecursiveAncenstoryError = createError(
	"INVALID_PAYLOAD_ERROR",
	"You are trying to assign a parent that would result in a recursive ancenstory. This would break the spacetime continuum, and thus it is not permitted.",
	400
);

/**
 * Generates a slug based on the provided payload and options.
 * @param meta - Metadata about the event.
 * @param payload - The payload object.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @param options - Options for slug generation.
 * @param options.fields - The fields to use for generating the slug.
 * @param options.output_key - The key where the generated slug will be stored.
 * @param options.locale - The locale to use for slug generation.
 * @param options.make_unique - Whether to make the slug unique by appending a random string.
 * @param options.lowercase - Whether to convert the slug to lowercase.
 * @returns The generated slug or null if no relevant input was provided.
 */
export const slugifyInputs = async (
	meta: Record<string, any>,
	payload: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext,
	{ fields, output_key, locale = "nl", make_unique = false, lowercase = true }: Options
): Promise<string | null> => {
	// If slug was manually provided, use that as a value
	let value = payload[output_key] || "";

	if (!value) {
		let values = fields.map((field) => payload[field]).filter(Boolean);

		// If not all fields are filled and the trigger is an update event, fetch existing values for unmodified fields
		if (values.length < fields.length && meta.event.includes(".update")) {
			if (meta.keys.length > 1) throw new EditMultipleError();

			const missingValues = fields.filter((field) => !payload[field]);
			const { services } = hookContext;
			const { ItemsService } = services;
			const itemsService = new ItemsService(meta.collection, {
				schema: eventContext.schema,
				knex: eventContext.database
			});

			const item = await itemsService.readMany(meta.keys, { fields: missingValues });
			values = fields.map((field) => payload[field] || item[0][field]).filter(Boolean);
		}

		value = values.join("-");
	}

	// If no relevant input was provided, return null
	if (!value) return null;

	// Slugify the value with options
	let slug = slugify(value, {
		replacement: "-",
		locale: locale === "en" ? undefined : locale,
		lower: lowercase,
		trim: true,
		strict: true,
		remove: /[*+~.()'"?!:@]/g
	});

	if (make_unique) {
		slug += `-${randomString(6)}`;
	}

	return slug;
};

/**
 * Finds the slug and path field in a given collection, based on the usage of the interfaces provided in this bundle. Only returns the first field of each type found.
 * @param collection - The collection name.
 * @param eventContext - The event context object.
 * @param hookContext - The hook context object.
 * @returns The slug and path field if found.
 */
export const findFieldsInCollection = async (
	collection: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<{ slug: Field | undefined; path: Field | undefined }> => {
	const { FieldsService } = hookContext.services;
	const fieldsService: FieldsService = new FieldsService({
		schema: eventContext.schema,
		knex: eventContext.database
	});
	const collectionFields = await fieldsService.readAll(collection);
	return {
		slug: collectionFields.find((field: Field) => field.meta?.interface === "oslug_interface"),
		path: collectionFields.find((field: Field) => field.meta?.interface === "opath_interface")
	};
};

/**
 * Generates the slug value based on the provided payload and slug field.
 * @param slugField - The slug field.
 * @param payload - The payload object.
 * @param meta - Metadata about the event.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @returns An object containing the slug key and value, or undefined.
 */
export const getSlugValue = async (
	slugField: Field,
	payload: Record<string, any>,
	meta: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<FormattedFieldPayload> => {
	const data: FormattedFieldPayload = {
		key: slugField.field,
		value: null
	};

	if (slugField.meta?.options?.on_create && meta.event !== "items.create") return data;

	const hasInput = (slugField.meta as FieldMeta).options?.fields.some((field: string) => Object.prototype.hasOwnProperty.call(payload, field));

	if (!hasInput && !Object.prototype.hasOwnProperty.call(payload, data.key)) return data;

	data.value = await slugifyInputs(meta, payload, eventContext, hookContext, {
		fields: slugField.meta?.options?.fields,
		output_key: slugField.field,
		locale: slugField.meta?.options?.locale,
		make_unique: slugField.meta?.options?.make_unique,
		lowercase: slugField.meta?.options?.lowercase
	});

	return data;
};

/**
 * Finds the archive field key and archive value in a specified collection.
 *
 * @param collection - The name of the collection to search in.
 * @param eventContext - The events context object
 * @param hookContext - The hook context object
 * @returns An object containing the archive field key and archive value.
 *
 * @example
 * ```typescript
 * const result = await findArchiveValueInCollection('my_collection', eventContext, hookContext);
 * console.log(result.archive_field_key); // Outputs the archive field key
 * console.log(result.archive_value); // Outputs the archive value
 * ```
 */
export const findArchiveFieldInCollection = async (
	collection: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<ArchiveFieldSettings> => {
	const { CollectionsService } = hookContext.services;
	const collections: CollectionsService = new CollectionsService({
		schema: eventContext.schema,
		knex: eventContext.database
	});

	const data = await collections.readOne(collection);
	return {
		archive_field_key: (data.meta as CollectionMeta)?.archive_field,
		archive_value: (data.meta as CollectionMeta)?.archive_value,
		is_boolean: (data.meta as CollectionMeta)?.archive_value === "true" || (data.meta as CollectionMeta)?.archive_value === "false" || typeof (data.meta as CollectionMeta)?.archive_value === "boolean"
	};
};

/**
 * Finds existing items in a collection based on the provided keys and returns slug values.
 * @param keys - The primary keys of the items to find.
 * @param collection - The collection name.
 * @param options - Options for finding existing items.
 * @param options.fields - The fields to retrieve for the existing items.
 * @param options.filter - Optional filter criteria to apply when finding existing items.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @returns The found items.
 */
export const findExistingItems = async (
	keys: PrimaryKey[],
	collection: string,
	options: {
		fields: string[];
		filter?: Record<string, any>;
	},
	eventContext: EventContext,
	hookContext: HookExtensionContext

): Promise<Record<string, any>[]> => {
	const { ItemsService } = hookContext.services;
	const itemsService: ItemsService = new ItemsService(collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});

	const { fields, filter } = options;
	return await itemsService.readMany(keys, { fields, filter });
};

/**
 * Finds the path of a parent item in a collection.
 *
 * @param parentId - The primary key of the parent item.
 * @param collection - The name of the collection to search in.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @returns A promise that resolves to the path of the parent item.
 */
export const findParentPath = async (
	parentId: PrimaryKey,
	collection: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<string> => {
	const { ItemsService } = hookContext.services;
	const itemsService: ItemsService = new ItemsService(collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});
	const parent = await itemsService.readOne(parentId, { fields: ["path"] });
	return parent.path;
};

/**
 * Generates the path value based on the provided payload, slug field, related parent(s) and Sluggernaut settings.
 * @param payload - The payload object.
 * @param meta - Metadata about the event.
 * @param options - Options for generating the path value.
 * @param options.pathField - The path field as Field type.
 * @param options.slug - An object containing the slug key and value.
 * @param options.slug.key - The field key for the slug.
 * @param options.slug.value - The value for the slug.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @returns An object containing the path key and value, or null if pathField is not provided.
 */
export const getPathValue = async (
	payload: Record<string, any>,
	meta: Record<string, any>,
	options: {
		pathField?: Field;
		slug: {
			key: string;
			value: string;
		};
	},
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<FormattedFieldPayload | null> => {
	const { pathField, slug } = options;
	if (!pathField) return null;

	const { services } = hookContext;
	const { use_namespace, use_trailing_slash, namespace } = await getSluggernautSettings(meta.collection, eventContext, hookContext);

	const parentFieldKey: string | undefined = pathField.meta?.options?.parent;

	const data: FormattedFieldPayload = {
		key: pathField.field,
		value: getPathString(slug.value, "slug", { use_namespace, use_trailing_slash, namespace })
	};

	if (!parentFieldKey) return data;

	let parentID = (payload as Record<string, any>)[parentFieldKey];

	if (!parentID && meta.event.includes(".update")) {
		const { ItemsService } = services;
		const itemsService: ItemsService = new ItemsService(meta.collection, {
			schema: eventContext.schema,
			knex: eventContext.database
		});
		const items = await itemsService.readMany(meta.keys, { fields: [parentFieldKey] });

		const uniqueParentIds = [...new Set(items.map((rec) => rec[parentFieldKey]).filter(Boolean))];
		if (uniqueParentIds.length > 1) throw new EditWithMultipleParentsError();
		else if (uniqueParentIds.length === 1) parentID = uniqueParentIds[0];
	}

	if (!parentID) return data;

	const parentPathValue = await findParentPath(
		parentID,
		meta.collection,
		eventContext,
		hookContext
	);

	return {
		key: pathField.field,
		value: getPathString(slug.value, "path", { use_namespace, use_trailing_slash, namespace }, parentPathValue)
	};
};

/**
 * Emits an update event for the specified fields.
 * This function is responsible for emitting an update event for the provided slug and path fields.
 * It fetches the existing items that are being updated to determine their current status and emits
 * a redirect update action if the slug or path has changed and the item is not archived.
 *
 * @param fields - An object containing the slug and path fields to be updated.
 * @param fields.slug - The slug field payload.
 * @param fields.path - The path field payload, or null if not provided.
 * @param archiveOptions - Options related to the archive field, including the archive field key and its type.
 * @param meta - Metadata about the event, including the collection and keys of the items being updated.
 * @param eventContext - The context of the event, including accountability information.
 * @param hookContext - The context of the hook, including services and emitter for emitting actions.
 *
 * @returns A promise that resolves when the update event has been emitted.
 */
export const emitUpdate = async (
	fields: { slug: FormattedFieldPayload; path?: FormattedFieldPayload | null },
	archiveOptions: ArchiveFieldSettings,
	meta: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<void> => {
	const { archive_field_key, is_boolean } = archiveOptions;
	const { path, slug } = fields;

	// Fetch the existing items that are updated, because we need their current status
	const items = await findExistingItems(
		meta.keys,
		meta.collection,
		{
			fields: !path ? [slug.key] : [slug.key, path.key],
			filter: archive_field_key && !is_boolean
				? {
						[archive_field_key]: {
							_in: publishedValues
						}
					}
				: (archive_field_key && is_boolean
						? {
								[archive_field_key]: {
									_eq: true
								}
							}
						: {})
		},
		eventContext,
		hookContext
	);

	// We only want to create redirects for slug changes if the item is not archived
	if (items.length > 0) {
		hookContext.emitter.emitAction(
			"redirect.update",
			{
				type: path ? "path" : "slug",
				oldValues: items.map((item) => item[path ? path.key : slug.key]),
				newValue: path ? path.value : slug.value,
				collection: meta.collection
			},
			eventContext
		);
	}
};

/**
 * Finds children of the specified keys in a collection.
 * @param keys - The primary keys of the parent items.
 * @param collection - The collection name.
 * @param parentFieldKey - The parent field key.
 * @param slugFieldKey - The slug field key.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 * @returns A promise that resolves to the primary keys of the children.
 */
export const findChildren = async (
	keys: PrimaryKey[],
	collection: string,
	parentFieldKey: string,
	slugFieldKey: string,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<{ id: string; slug: string }[]> => {
	const { ItemsService } = hookContext.services;
	const itemsService: ItemsService = new ItemsService(collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});
	const items = await itemsService.readByQuery({ fields: ["id", slugFieldKey], filter: { [parentFieldKey]: { _in: keys } } });

	return items.map((rec) => ({ id: rec.id, slug: rec[slugFieldKey] }));
};

/**
 * Emits a delete event for the specified fields.
 * @param fields - An object containing the slug field and path field.
 * @param fields.slugField - The slug field as Field type.
 * @param fields.pathField - The optional path field as Field type.
 * @param meta - Metadata about the event.
 * @param eventContext - The event's context object.
 * @param hookContext - The hook context object.
 */
export const emitDelete = async (
	fields: { slugField: Field; pathField: Field | undefined },
	meta: Record<string, any>,
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<void> => {
	const { slugField, pathField } = fields;
	const { emitter } = hookContext;

	const items = await findExistingItems(
		meta.keys,
		meta.collection,
		{
			fields: pathField ? [slugField.field, pathField.field] : [slugField.field]
		},
		eventContext,
		hookContext
	);

	emitter.emitAction("redirect.delete", {
		type: pathField ? "path" : "slug",
		values: items.map((item) => item[pathField ? pathField.field : slugField.field]),
		collection: meta.collection
	}, eventContext);
};

/**
 * Recursively check if a self referencing ancestory is created
 *
 * @param keys - The items where the new parent is assigned
 * @param meta - Meta info about the event
 * @param parentInputId - The new parent id
 * @param parentFieldKey - The field key of the parent field
 * @param eventContext - The context of the event
 * @param hookContext - The context of the hook
 * @returns A promise that resolves when the check is complete
 * @throws RecursiveAncenstoryError if a recursive ancestry is detected
 */
export const preventRecursiveAncestory = async (
	keys: PrimaryKey[], // the items where the new parent is assigned
	meta: Record<string, any>, // meta info about the event
	parentInputId: PrimaryKey, // the new parent id
	parentFieldKey: string, // the field key of the parent field
	eventContext: EventContext,
	hookContext: HookExtensionContext
): Promise<void> => {
	const { ItemsService } = hookContext.services;
	const itemsService: ItemsService = new ItemsService(meta.collection, {
		schema: eventContext.schema,
		knex: eventContext.database
	});

	/*
        To prevent the creation of recursive ancestry, you need to check if the new parent
        is already a descendant of the item being updated. If it is, then assigning it as
        a parent would create a recursive relationship.

        1. fetch the children for the item that is being updated
        2. Check if the new parent is one of these children. If yes throw an error
        3. Else call the function for each child
    */

	for await (const key of keys) {
		const children = await itemsService.readByQuery({ fields: ["id"], filter: { [parentFieldKey]: { _eq: key } } });

		if (children.length === 0) {
			return;
		}
		else if (children.some((child) => child.id === parentInputId)) {
			throw new RecursiveAncenstoryError();
		}
		else {
			await preventRecursiveAncestory(
				children.map((child) => child.id),
				meta,
				parentInputId,
				parentFieldKey,
				eventContext,
				hookContext
			);
		}
	}
};
