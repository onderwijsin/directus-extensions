import { ApiExtensionContext } from "@directus/extensions"
import { safeSchemaChangesOnStartup, checkIfItemExists } from "utils"
import { dataSyncPolicySchema, dataSyncUserSchema, dataSyncAccessSchema } from "./schema"
import { createError } from "@directus/errors"
import { PrimaryKey } from "@directus/types"
import { SyncConfig } from "./config"

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
            schema: await context.getSchema()
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


export const prunePayload = (
    payload: Record<string, any>, 
    fields: SyncConfig["remotes"][number]['schema'][number]['fields']
): Record<string, any> => {
    return Object.keys(payload).reduce((acc, key) => {
        if (fields.find(f => f.key === key)) {
            acc[key] = payload[key]
        }
        return acc
    }, {} as Record<string, any>)
}