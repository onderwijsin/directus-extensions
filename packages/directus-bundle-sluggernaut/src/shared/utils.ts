import type { CollectionMeta, SchemaOverview } from '@directus/types';
import type { CollectionsService, SettingsService } from '@directus/api/dist/services';

/**
 * Retrieves redirect settings for a given collection.
 * 
 * @param collection - The name of the collection.
 * @param services - An object containing the CollectionsService and SettingsService.
 * @param getSchema - A function to get the schema.
 * @returns A promise that resolves to the redirect settings.
 */
export const getSluggernautSettings = async (
    collection: string, 
    services: { CollectionsService: typeof CollectionsService, SettingsService: typeof SettingsService }, 
    getSchema: () => Promise<SchemaOverview>
): Promise<RedirectSettings> => {
    const { SettingsService, CollectionsService } = services;
    const settings = new SettingsService({ schema: await getSchema() });
    const collections = new CollectionsService({ schema: await getSchema() });

    const data = await settings.readByQuery({ fields: ['use_trailing_slash', 'use_namespace']})
    const collectionData = await collections.readOne(collection);

    return {
        // Cast global settings to boolean, since they might be missing	
        use_trailing_slash: !!data[0]?.use_trailing_slash,
        use_namespace: !!data[0]?.use_namespace,
        namespace: (collectionData.meta as CollectionMeta & { namespace: null | string })?.namespace
    }
}