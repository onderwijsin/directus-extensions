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

    // const { FieldsService } = services;
    // const fieldsService: FieldsService = new FieldsService({
    //     schema: await getSchema(),
    // });

    // // Secondly, create an additional settings field, but with dynamic schema values
    // const schema = await getSchema()
    // const { collections } = schema
    // const collectionKeys = Object.keys(collections).filter(key => !key.startsWith('directus_') && key !== 'redirects')

    // const fieldSchema = redirectCollectionsSelectFieldSchema(
    //     collectionKeys.map((key) => ({
    //         text: key.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    //         value: key
    //     }))
    // )
    // try {
    //     const existingField = await fieldsService.readOne('directus_settings', 'redirect_collections');

    //     try {
    //         const existingChoices: string[] = existingField.meta.options.choices.map((choice: { value: string }) => choice.value);

    //         // check if the array existingChoices and collectionKeys have identical values
    //         const areChoicesIdentical = existingChoices.length === collectionKeys.length && existingChoices.every((choice) => collectionKeys.includes(choice));
    //         if (!areChoicesIdentical) {
    //             await fieldsService.updateField('directus_settings', fieldSchema);
    //         } 

    //     } catch (error) {
    //         console.log('Something went wrong while updating the directus_settings field redirect_collections');
    //         console.log(error);
    //     }

    // } catch (error) {
    //     console.log('No redirect_collections field found. Creating it now');
    //     try {
    //         await fieldsService.createField('directus_settings', fieldSchema);
    //     } catch (error) {
    //         console.log('Something went wrong while creating the directus_settings fields');
    //         console.log(error);
    //     }
    // }
}