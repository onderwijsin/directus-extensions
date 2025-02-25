import { settingSchema } from './schema';
import type { FieldsService } from '@directus/api/dist/services';
import type { SchemaOverview } from '@directus/types';

interface Services {
    FieldsService: typeof FieldsService;
    [key: string]: any;
}

interface Context {
    services: Services;
    getSchema: () => Promise<SchemaOverview>;
}

/**
 * Creates missing fields in the 'directus_settings' collection based on the provided schema.
 * @param services - The services object containing the FieldsService.
 * @param getSchema - Function to get the schema overview.
 */
const createSettingFields = async (services: Services, getSchema: () => Promise<SchemaOverview>): Promise<void> => {
    const { FieldsService } = services;

    const fieldsService: FieldsService = new FieldsService({
        schema: await getSchema(),
    });

    try {
        const existingFields = await fieldsService.readAll('directus_settings');

        const missingFields = settingSchema.filter((field) => !existingFields.find((f) => f.field === field.field));

        for (const field of missingFields) {
            await fieldsService.createField('directus_settings', field);
        }
    } catch (error) {
        console.log('Something went wrong while creating the directus_settings fields');
        console.log(error);
    }
};

/**
 * Adds fields to the 'directus_settings' collection based on the provided schema.
 * @param context - The context object containing services and schema getter.
 */
export const addFieldsToDirectusSettings = async ({ services, getSchema }: Context): Promise<void> => {
    // First add the fields to directus_settings
    await createSettingFields(services, getSchema);
};