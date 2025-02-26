import { defineHook } from '@directus/extensions-sdk';
import type { PrimaryKey } from '@directus/types';
import { findFieldsInCollection, getSlugValue, findExistingItems, findArchiveFieldInCollection, findParentPath } from './helpers';
import { getRedirectSettings } from '../shared/utils'

const publishedValues = ['published', 'active'];

export default defineHook(({ filter }, hookContext) => {
    const { services, emitter, getSchema } = hookContext;

    filter('items.create', async (payload, meta) => {
        if (!payload || typeof payload !== 'object') return;

        const { slug: slugField, path } = await findFieldsInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const slug = await getSlugValue(payload, meta, hookContext, slugField);
        if (!slug?.value) return;

        let data = {
            ...payload,
            [slug.key]: slug.value
        }

        if (!path) return data

        const { use_namespace, use_trailing_slash, namespace } = await getRedirectSettings(meta.collection, services, getSchema);
        
        const parentFieldKey: string | undefined = path.meta?.options?.parent;

        if (!parentFieldKey || !(payload as Record<string, any>)[parentFieldKey]) return {
            ...data,
            path: `/${use_namespace && !!namespace ? (namespace + '/') : ''}${slug.value}${use_trailing_slash ? '/' : ''}` 
        };

        const parentID = (payload as Record<string, any>)[parentFieldKey]

        const parentPathValue = await findParentPath(
            meta.collection,
            services,
            getSchema,
            parentID
        )

        return {
            ...data,
            path: `${parentPathValue.endsWith('/') ? parentPathValue : (parentPathValue + '/')}${slug.value}${use_trailing_slash ? '/' : ''}` 
        }
        
    });

    filter('items.update', async (payload, meta, context) => {
        if (!payload || typeof payload !== 'object') return;

        const { accountability } = context;

        const { slug: slugField, path } = await findFieldsInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        // If the item is archived, delete any redirects to it
        const { archive_field_key, is_boolean } = await findArchiveFieldInCollection(meta.collection, services, getSchema);
        if (!!archive_field_key && (archive_field_key in payload && !publishedValues.includes((payload as Record<string, any>)[archive_field_key]))) {
            const items = await findExistingItems(meta.collection, services, getSchema, accountability, meta.keys, [slugField.field]);
            emitter.emitAction('redirect.delete', { slugs: items.map(item => item[slugField.field]), collection: meta.collection }, context);
            return;
        }

        // Get slug value based on payload
        const slug = await getSlugValue(payload, meta, hookContext, slugField);
        if (!slug?.value) return;

        // Fetch the existing items that are updated, because we need their current status
        const items = await findExistingItems(meta.collection, services, getSchema, accountability, meta.keys, [slug.key], archive_field_key && !is_boolean ? {
            [archive_field_key]: {
                "_in": publishedValues
            } 
        } : archive_field_key && is_boolean ? {
            [archive_field_key]: {
                "_eq": true
            } 
        }: {});

        // We only want to create redirects for slug changes if the item is not archived
        if (!!items.length) {
            emitter.emitAction(
                'redirect.update', 
                {
                    oldValues: items.map(item => item[slug.key]),
                    newValue: slug.value,
                    collection: meta.collection
                },
                context
            );
        }
        

        return {
            ...payload,
            [slug.key]: slug.value
        };
    });

    filter('items.delete', async (payload, meta, context) => {
        const { slug: slugField, path } = await findFieldsInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const items = await findExistingItems(meta.collection, services, getSchema, context.accountability, payload as PrimaryKey[], [slugField.field]);
        emitter.emitAction('redirect.delete', { slugs: items.map(item => item[slugField.field]), collection: meta.collection }, context);
    });
});