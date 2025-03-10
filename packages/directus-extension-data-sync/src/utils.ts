import { ItemsService } from '@directus/api/dist/services';
import { ApiExtensionContext } from "@directus/extensions"
import { safeSchemaChangesOnStartup, checkIfItemExists } from "utils"
import { dataSyncPolicySchema, dataSyncUserSchema, dataSyncAccessSchema } from "./schema"
import { createError } from "@directus/errors"
import { PrimaryKey, EventContext } from "@directus/types"
import { RemoteConfig, RawRemoteConfig, Schema } from "./types"

const CreateItemFromSchemaError = createError(
    'EXTENSION_LOAD_ERROR',
    (message: string) => message,
    500
)

const createItemIfNotExists = async (
    context: ApiExtensionContext,
    serviceKey: string,
    schema: Record<string, any> & { id: PrimaryKey},
    errorMessage: string
) => {
    await safeSchemaChangesOnStartup(async (context: ApiExtensionContext) => {
        const serviceInstance = new context.services[serviceKey]({
            schema: await context.getSchema(),
            knex: context.database
        })

        const itemAlreadyExists = await checkIfItemExists(async () => await serviceInstance.readOne(schema.id))

        if (!itemAlreadyExists) {
            try {
                await serviceInstance.createOne(schema)
            } catch (error) {
                throw new CreateItemFromSchemaError(errorMessage)
            }
        }
    }, [context])
}

export const createDataSyncPolicy = async (context: ApiExtensionContext) => {
    await createItemIfNotExists(
        context,
        'PoliciesService',
        dataSyncPolicySchema,
        'Error creating policy from the Data Sync extension'
    )
}

export const createDataSyncUser = async (context: ApiExtensionContext) => {
    await createItemIfNotExists(
        context,
        'UsersService',
        dataSyncUserSchema,
        'Error creating user from the Data Sync extension'
    )
}

export const assignPolicy = async (context: ApiExtensionContext) => {
    await createItemIfNotExists(
        context,
        'AccessService',
        dataSyncAccessSchema,
        'Error creating access relation from the Data Sync extension'
    )
}


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
    const errors: string[] = []
    if (!schema || !Array.isArray(schema)) {
        errors.push('Schema is not an array');
    }
    if (!errors.length && Array.isArray(schema)) {
        schema.forEach(({ collection, fields }) => {
            if (!collection || !fields) errors.push('Schema object is missing required properties');
            if (typeof collection !== 'string') errors.push('Collection must be a string');
            if (!fields || !Array.isArray(fields)) errors.push('Fields must be an array');
            if (!fields.every((field: any) => typeof field === 'string')) errors.push('Fields must only contain strings');
        })
    }
    
    if (!!errors.length) logger.warn('Schema validation errors:', errors)
    return !errors.length
}

export const fetchRemotes = async (eventContext: EventContext, context: ApiExtensionContext): Promise<RemoteConfig[]> => {
    const { ItemsService } = context.services
    const items: ItemsService = new ItemsService('data_sync_remote_sources', {
        schema: eventContext.schema,
        knex: eventContext.database
    })

    const remotes = await items.readByQuery({
        filter: {
            status: {
                _eq: 'published'
            }
        },
        fields: [
            'id',
            'url',
            'api_key',
            'status',
            'schema',
            'users_notification.directus_users_id'
        ]
    }) as RawRemoteConfig[]

    return remotes.map((remote: RawRemoteConfig) => {
        return {
            id: remote.id,
            status: remote.status,
            url: remote.url,
            api_key: remote.api_key,
            schema: validateSchema(remote.schema, context.logger) ? remote.schema as Schema : null,
            users_notification: remote.users_notification.map(user => user.directus_users_id)
        }
    }) as RemoteConfig[]
}