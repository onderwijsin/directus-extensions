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

const validateSchema = (schema: any): Schema | null => {
    if (!schema) {
        return null
    }

    if (!Array.isArray(schema)) {
        return null
    }

    return schema.map((collection: any) => {
        if (typeof collection.collection !== 'string') {
            return null
        }

        if (!Array.isArray(collection.fields) && collection.fields.some((field: any) => typeof field !== 'string')) {
            return null
        }

        return {
            collection: collection.collection,
            fields: collection.fields
        }
    }).filter((collection: any) => collection !== null) as Schema
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
            schema: validateSchema(remote.schema),
            users_notification: remote.users_notification.map(user => user.directus_users_id)
        }
    }) as RemoteConfig[]
}