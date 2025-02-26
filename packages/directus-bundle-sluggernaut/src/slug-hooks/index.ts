import { defineHook } from '@directus/extensions-sdk';
import type { PrimaryKey } from '@directus/types';
import { findSlugFieldInCollection, getSlugValue, findExistingItems, findArchiveValueInCollection } from './helpers';


export default defineHook(({ filter }, hookContext) => {
    const { services, emitter, getSchema } = hookContext;

    filter('items.create', async (payload, meta) => {
        if (!payload || typeof payload !== 'object') return;

        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const slug = await getSlugValue(payload, meta, hookContext, slugField);
        if (!slug?.value) return;

        return {
            ...payload,
            [slug.key]: slug.value
        };
    });

    filter('items.update', async (payload, meta, context) => {
        if (!payload || typeof payload !== 'object') return;

        const { accountability } = context;

        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        // If the item is archived, delete any redirects to it
        const { archive_field_key, archive_value } = await findArchiveValueInCollection(meta.collection, services, getSchema);
        if (!!archive_field_key && (archive_field_key in payload && (payload as Record<string, any>)[archive_field_key] === archive_value)) {
            const items = await findExistingItems(meta.collection, services, getSchema, accountability, meta.keys, [slugField.field]);
            emitter.emitAction('slug.delete', { slugs: items.map(item => item[slugField.field]), collection: meta.collection }, context);
            return;
        }

        const slug = await getSlugValue(payload, meta, hookContext, slugField);

        if (!slug?.value) return;

        const items = await findExistingItems(meta.collection, services, getSchema, accountability, meta.keys, [slug.key], archive_field_key ? {
            [archive_field_key]: {
                "_neq": archive_value
            }
        } : {});

        // We only want to create redirects for slug changes if the item is not archived
        if (!!items.length) {
            emitter.emitAction(
                'slug.update', 
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
        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const items = await findExistingItems(meta.collection, services, getSchema, context.accountability, payload as PrimaryKey[], [slugField.field]);
        emitter.emitAction('slug.delete', { slugs: items.map(item => item[slugField.field]), collection: meta.collection }, context);
    });
});