import type { FieldsService } from '@directus/api/dist/services';
import type { SchemaOverview } from '@directus/types';
import { namespaceFieldSchema } from './schema';

interface Services {
    FieldsService: typeof FieldsService;
    [key: string]: any;
}

interface Context {
    services: Services;
    getSchema: () => Promise<SchemaOverview>;
}

/**
 * Adds the 'namespace' field to the 'directus_collections' collection if it does not exist.
 * @param context - The context object containing services and schema getter.
 */
export const addNamespaceFieldToCollections = async ({ services, getSchema }: Context): Promise<void> => {
    const { FieldsService } = services;

    const fieldsService: FieldsService = new FieldsService({
        schema: await getSchema(),
    });

    try {
        const existingFields = await fieldsService.readAll('directus_collections');

        const existingNamespaceField = existingFields.find((field) => field.field === 'namespace');

        if (!existingNamespaceField) {
            await fieldsService.createField('directus_collections', namespaceFieldSchema);
        }
    } catch (error) {
        console.log('Something went wrong while creating the namespace field in directus_collections');
        console.log(error);
    }
};