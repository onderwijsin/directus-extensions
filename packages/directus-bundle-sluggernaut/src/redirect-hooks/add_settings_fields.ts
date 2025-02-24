import { settingSchema } from "./schema"
import type { FieldsService } from '@directus/api/dist/services';

const createSettingFields = async (services: any, getSchema: any) => {
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
    
}
    

export const addFieldsToDirectusSettings = async ({ services, getSchema }: any) => {
    // First add the fields to directus_settings
    await createSettingFields(services, getSchema);
}