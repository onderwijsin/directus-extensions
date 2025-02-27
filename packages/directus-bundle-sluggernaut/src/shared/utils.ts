import type { CollectionMeta } from '@directus/types';
import type { CollectionsService, SettingsService } from '@directus/api/dist/services';
import type { HookExtensionContext } from '@directus/extensions'
/**
 * Retrieves sluggernaut settings for a given collection.
 * 
 * @param collection - The name of the collection.
 * @param hookContext - An object containing the context from registering the hook.
 * @returns A promise that resolves to the sluggernaut settings.
 */
export const getSluggernautSettings = async (
    collection: string, 
    hookContext: HookExtensionContext
): Promise<SluggernautSettings> => {
    const { services, getSchema } = hookContext;
    const { SettingsService, CollectionsService } = services;
    const settings: SettingsService = new SettingsService({ schema: await getSchema() });
    const collections: CollectionsService = new CollectionsService({ schema: await getSchema() });

    const data = await settings.readByQuery({ fields: ['use_trailing_slash', 'use_namespace']})
    const collectionData = await collections.readOne(collection);

    return {
        // Cast global settings to boolean, since they might be missing	
        use_trailing_slash: !!data[0]?.use_trailing_slash,
        use_namespace: !!data[0]?.use_namespace,
        namespace: (collectionData.meta as CollectionMeta & { namespace: null | string })?.namespace
    }
}

/**
 * Get a formatted path string based on input variables
 * 
 * @param value - the slug value
 * @param type - Wheter this input value is a slug or a path
 * @param settings - The sluggernaut settings for the collection
 * @params parentPath - The parent path of the current item. Needs te be provided when the input value is a path
 * @returns formatted path string, including namespace, parent slugs and (optional) trailing slash
 */
export const getPathString = (value: string, type: ValueType, settings: SluggernautSettings, parentPath?: string): string => {
    const { use_namespace, use_trailing_slash, namespace } = settings;
    if (type === 'slug' || !parentPath) return `/${use_namespace && !!namespace ? (namespace + '/') : ''}${value}${use_trailing_slash ? '/' : ''}`
    return  `${parentPath.endsWith('/') ? parentPath : (parentPath + '/')}${value}${use_trailing_slash ? '/' : ''}`
}