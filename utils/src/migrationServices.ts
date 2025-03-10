import type { CollectionsService, FieldsService, RelationsService } from "@directus/api/dist/services";
import type { ApiExtensionContext } from "@directus/extensions";
import type { Collection, Field, Relation } from "@directus/types";

const fieldTypeMap: { [key: string]: string } = {
	"timestamp without time zone": "datetime",
	"character varying": "varchar",
	"uuid": "char"
};

/**
 * Compares two field configurations to check if they are equal.
 *
 * @param field1 - The first field configuration.
 * @param field2 - The second field configuration.
 * @returns True if the field configurations are equal, false otherwise.
 */
const equalFieldConfig = (field1: Field, field2: Field): boolean => {
	if (field1.type !== field2.type) {
		return false;
	}

	if (!field1.schema && !field2.schema) {
		return true;
	}

	if (!field1.schema || !field2.schema) {
		return false;
	}

	return Object.entries(field1.schema).every(
		([key, value]) => {
			// There is different schema props for different database providers.
			// We need to check if the current value is string or number. If not, its falsy or thruthy,
			// And we can equate them directly. In that case it doesnt matter if a field is not present
			// in the other field schema

			// Except for field type values! These strings differ between database providers.
			// See fieldTypeMap for the (rather incomplete) mapping
			const value2 = field2.schema?.[key as keyof typeof field2.schema];

			if (typeof value === "number") return value2 === value;

			if (typeof value === "string" && typeof value2 === "string") {
				return value2 === value || fieldTypeMap[value2] === value || fieldTypeMap[value] === value2;
			}

			if (typeof value === "string") return value2 === value;

			return !!value === !!value2;
		}
	);
};

/**
 * Compares two relation configurations to check if they are equal.
 *
 * @param relation1 - The first relation configuration.
 * @param relation2 - The second relation configuration.
 * @returns True if the relation configurations are equal, false otherwise.
 */
const equalRelationConfig = (relation1: Relation, relation2: Relation): boolean => {
	if (relation1.collection !== relation2.collection) {
		return false;
	}

	if (relation1.related_collection !== relation2.related_collection) {
		return false;
	}

	if (!relation1.schema && !relation2.schema) {
		return true;
	}

	if (!relation1.schema || !relation2.schema) {
		return false;
	}

	return Object.entries(relation1.schema).every(
		([key, value]) => {
			const value2 = relation2.schema?.[key as keyof typeof relation2.schema];

			if (typeof value === "string" && typeof value2 === "string") {
				return value2 === value || fieldTypeMap[value2] === value || fieldTypeMap[value] === value2;
			}

			if (typeof value === "string") return value2 === value;
			return !!value === !!value2;
		}
	);
};

/**
 * A wrapper function that retries the provided callback function up to a maximum of 3 times
 * if it encounters an error with the message 'aborted'.
 *
 * @param callback - The function to be executed.
 * @param args - The arguments to be passed to the callback function.
 * @param retry - The current retry count. Default is 0.
 * @returns A promise that resolves when the callback function executes successfully or rejects if the maximum retries are reached.
 * @throws Will throw an error if the callback function fails with an error other than 'aborted' or if the maximum retries are reached.
 */
export const safeSchemaChangesOnStartup = async (
	callback: (...args: any[]) => Promise<void>,
	args: any[],
	retry = 0
): Promise<void> => {
	try {
		await callback(...args);
	}
	catch (error: any) {
		if (error?.message === "aborted" && retry < 3) {
			console.error("caught aborted error. Current try:", retry);
			retry++;
			await safeSchemaChangesOnStartup(callback, args, retry);
		}
		else {
			throw error;
		}
	}
};

/**
 * A wrapper function to check if a certain items already exists in the database.
 * You need to supply your own service.readOne() function to check if the item exists.
 * If it doesn't exist, the service will throw an error, which checkIfItemExists() will catch.
 *
 * @param callback - The service.readOne() to be executed.
 * @returns a promise that resolves to true if the item exists, false otherwise.
 */
export const checkIfItemExists = async <T>(callback: () => Promise<T>): Promise<boolean> => {
	try {
		await callback();
		return true;
	}
	catch {
		return false;
	}
};

/**
 * Creates or updates fields in a collection.
 *
 * @param collection - The name of the collection.
 * @param fieldSchema - The schema for the fields.
 * @param context - The extensions context object.
 * @returns A promise that resolves when the fields are created or updated.
 */
export const createOrUpdateFieldsInCollection = async (
	collection: string,
	fieldSchema: Field[],
	context: ApiExtensionContext
): Promise<void> => {
	await safeSchemaChangesOnStartup(async () => {
		const { services, getSchema, logger } = context;
		const { FieldsService } = services;
		const fieldsService: FieldsService = new FieldsService({
			schema: await getSchema(),
			knex: context.database
		});

		const fields = await fieldsService.readAll(collection);
		const missingFields: Field[] = [];
		const invalidFields: Field[] = [];

		fieldSchema.forEach((field) => {
			const existingField = fields.find((f: Field) => f.field === field.field);

			if (!existingField) {
				missingFields.push(field);
			}
			else if (!equalFieldConfig(field, existingField)) {
				invalidFields.push(field);
			}
		});

		if (missingFields.length > 0) {
			for (const field of missingFields) {
				await fieldsService.createField(collection, field);
				logger.info(`Created field: ${field.field}`);
			}
		}

		if (invalidFields.length > 0) {
			await fieldsService.updateFields(collection, invalidFields);
			logger.info(`Updated fields: ${invalidFields.map((f) => f.field).join(", ")}`);
		}
	}, [collection, fieldSchema, context]);
};

/**
 * Creates or updates relations for a collection.
 *
 * @param collection - The name of the collection.
 * @param relationSchema - The schema for the relations.
 * @param context - The extensions context object.
 * @returns A promise that resolves when the relations are created or updated.
 */
export const createOrUpdateRelationsInCollection = async (
	collection: string,
	relationSchema: Relation[],
	context: ApiExtensionContext
): Promise<void> => {
	await safeSchemaChangesOnStartup(async () => {
		const { services, getSchema, logger } = context;
		const { RelationsService } = services;
		const relationsService: RelationsService = new RelationsService({
			schema: await getSchema(),
			knex: context.database
		});

		const relations = await relationsService.readAll(collection);
		const missingRelations: Relation[] = [];
		const invalidRelations: Relation[] = [];

		relationSchema.forEach((relation) => {
			const existingRelation = relations.find((r: Relation) => r.field === relation.field);

			if (!existingRelation) {
				missingRelations.push(relation);
			}
			else if (!equalRelationConfig(relation, existingRelation)) {
				invalidRelations.push(relation);
			}
		});

		if (missingRelations.length > 0) {
			for (const rel of missingRelations) {
				await relationsService.createOne(rel);
				logger.info(`Created relation: ${rel.field}`);
			}
		}

		if (invalidRelations.length > 0) {
			for (const rel of invalidRelations) {
				await relationsService.updateOne(collection, rel.field, rel);
				logger.info(`Updated relations: ${invalidRelations.map((f) => f.field).join(", ")}`);
			}
		}
	}, [collection, relationSchema, context]);
};

/**
 * Creates a collection from the provided schemas. If the collection already exists,
 * it updates the fields and relations. If the collection does not exist, it creates
 * the collection and its relations.
 *
 * @param collection - The name of the collection to create or update.
 * @param schemas - The schemas for the collection, fields, and relations.
 * @param schemas.collectionSchema - The schema for the collection.
 * @param schemas.fieldSchema - The schema for the fields.
 * @param schemas.relationSchema - The schema for the relations (optional).
 * @param context - The extensions context object.
 * @returns A promise that resolves when the collection and its relations are created or updated.
 */
export const createOrUpdateCollection = async (
	collection: string,
	schemas: {
		collectionSchema: Collection;
		fieldSchema: Field[];
		relationSchema?: Relation[];
	},
	context: ApiExtensionContext
): Promise<void> => {
	await safeSchemaChangesOnStartup(async () => {
		const { services, getSchema, logger } = context;
		const { CollectionsService } = services;
		const { collectionSchema, fieldSchema, relationSchema } = schemas;
		const collectionsService: CollectionsService = new CollectionsService({
			schema: await getSchema(),
			knex: context.database
		});

		// This call will return a 403 if it does not yet exist, so we need a try / catch block
		try {
			await collectionsService.readOne(collection);
			await createOrUpdateFieldsInCollection(collection, fieldSchema, context);
			if (relationSchema) await createOrUpdateRelationsInCollection(collection, relationSchema, context);
		}
		catch (error: any) {
			// If aborted error, we want the retry mechanism to kick in
			if (error?.message === "aborted") {
				throw error;
			}
			else {
				// Otherwise, the collection just does not exist yet
				await collectionsService.createOne({
					...collectionSchema,
					fields: fieldSchema,
					collection
				});

				logger.info("Created collection");

				logger.info({
					collection,
					fields: fieldSchema.map((f) => f.field)
				});

				if (relationSchema) await createOrUpdateRelationsInCollection(collection, relationSchema, context);
			}
		}
	}, [collection, schemas, context]);
};
