import type { FieldsService } from "@directus/api/dist/services";
import { namespaceFieldSchema } from "./schema";

export const addNamespaceFieldToCollections = async ({ services, getSchema }: any) => {
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
}