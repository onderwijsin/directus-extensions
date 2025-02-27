import { defineHook } from '@directus/extensions-sdk';
import type { PrimaryKey } from '@directus/types';
import { findFieldsInCollection, getSlugValue, findArchiveFieldInCollection, getPathValue, emitDelete, emitUpdate } from './helpers';
import { publishedValues } from './constants';

export default defineHook(({ filter }, hookContext) => {
    filter('items.create', async (payload, meta, eventContext) => {
        if (!payload || typeof payload !== 'object') return;

        const { slug: slugField, path: pathField } = await findFieldsInCollection(meta.collection, hookContext);
        if (!slugField) return;

        const slug = await getSlugValue(slugField, payload, meta, eventContext, hookContext);
        if (!slug.value) return;

        let data = {
            ...payload,
            [slug.key]: slug.value
        }

        // If no path field is found, return the data with the slug value
        if (!pathField) return data

        const path = await getPathValue(payload, meta, { pathField, slug: slug as { key: string, value: string } }, eventContext, hookContext);
        if (!path?.value) return data;

        return {
            ...data,
            [path.key]: path.value
        }
        
    });

    filter('items.update', async (payload, meta, eventContext) => {
        if (!payload || typeof payload !== 'object') return;


        const { slug: slugField, path: pathField } = await findFieldsInCollection(meta.collection, hookContext);
        if (!slugField) return;

        
        // If the item is archived, delete any redirects to it's (old) slugs
        const { archive_field_key, archive_value, is_boolean } = await findArchiveFieldInCollection(meta.collection, hookContext);
        if (!!archive_field_key && (archive_field_key in payload && !publishedValues.includes((payload as Record<string, any>)[archive_field_key]))) {
            await emitDelete(
                { slugField, pathField },
                meta,
                eventContext,
                hookContext
            )
        }

        // Get slug value based on payload
        const slug = await getSlugValue(slugField, payload, meta, eventContext, hookContext);
        if (!slug.value) return;
        const path = await getPathValue(payload, meta, { pathField, slug: slug as { key: string, value: string } }, eventContext, hookContext);
        

        
        await emitUpdate(
            { slug, path },
            { archive_field_key, archive_value, is_boolean },
            meta,
            eventContext,
            hookContext
        )

        let data = {
            ...payload,
            [slug.key]: slug.value,
        }
        
        if (!path) return data
        return {
            ...data,
            [path.key]: path.value
        }
    });

    filter('items.delete', async (payload, meta, eventContext) => {
        const { slug: slugField, path: pathField } = await findFieldsInCollection(meta.collection, hookContext);
        if (!slugField) return;

        await emitDelete(
            { slugField, pathField },
            // NOTE: the delete event meta does not contain the item keys, these are the payload!
            {
                ...meta,
                keys: payload as PrimaryKey[]
            },
            eventContext,
            hookContext
        )
    });
});