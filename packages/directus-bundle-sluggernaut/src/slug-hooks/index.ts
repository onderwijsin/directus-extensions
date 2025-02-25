import { defineHook } from '@directus/extensions-sdk';
import type { PrimaryKey } from '@directus/types';
import { findSlugFieldInCollection, getSlugValue, findExistingItems } from './helpers';


export default defineHook(({ filter }, context) => {
    const { services, emitter, getSchema } = context;

    filter('items.create', async (payload, meta) => {
        if (!payload || typeof payload !== 'object') return;

        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const slug = await getSlugValue(payload, meta, context, slugField);
        if (!slug?.value) return;

        return {
            ...payload,
            [slug.key]: slug.value
        };
    });

    filter('items.update', async (payload, meta, { accountability }) => {
        if (!payload || typeof payload !== 'object') return;

        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        if ('status' in payload && payload.status !== 'published' && payload.status !== 'active') {
            const items = await findExistingItems(meta.collection, services, getSchema, accountability, meta.keys, slugField.field);
            emitter.emitAction('slug.delete', { slugs: items.map(item => item[slugField.field]) });
            return;
        }

        const slug = await getSlugValue(payload, meta, context, slugField);
        if (!slug?.value) return;

        const items = await findExistingItems(meta.collection, services, getSchema, accountability, [meta.primaryKey], slug.key);
        emitter.emitAction('slug.update', {
            oldValues: items.map(item => item[slug.key]),
            newValue: slug.value,
            collection: meta.collection
        });

        return {
            ...payload,
            [slug.key]: slug.value
        };
    });

    filter('items.delete', async (payload, meta, { accountability }) => {
        const slugField = await findSlugFieldInCollection(meta.collection, services, getSchema);
        if (!slugField) return;

        const items = await findExistingItems(meta.collection, services, getSchema, accountability, payload as PrimaryKey[], slugField.field);
        emitter.emitAction('slug.delete', { slugs: items.map(item => item[slugField.field]) });
    });
});