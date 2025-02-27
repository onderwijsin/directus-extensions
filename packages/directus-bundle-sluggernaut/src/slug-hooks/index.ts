import { defineHook } from '@directus/extensions-sdk';
import type { EventContext, PrimaryKey } from '@directus/types';
import { findFieldsInCollection, getSlugValue, findArchiveFieldInCollection, getPathValue, emitDelete, emitUpdate, findExistingItems, findChildren, preventRecursiveAncestory } from './helpers';

import { EditMultipleParentsChildrenError, EditMultipleParentsError } from './helpers'
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
        let slug = await getSlugValue(slugField, payload, meta, eventContext, hookContext);

        // The slug might not be edited, but it IS possible that the path should be updated due to teh selection of a new parent
        const parentFieldKey: string | undefined = pathField?.meta?.options?.parent;

        const parentInputId: string | undefined = parentFieldKey ? (payload as Record<string, any>)[parentFieldKey] : undefined;

        // We should manually check to see if recursive ancestory is created when a new parent is assigned. Becasue this will break down the system
        if (parentInputId) {
            await preventRecursiveAncestory(
                meta.keys,
                meta,
                parentInputId,
                parentFieldKey as string,
                eventContext,
                hookContext
            )
        }

        if (!slug.value && !parentInputId && (!!pathField && !(payload as Record<string, any>)[pathField.field])) return;

        // At this point, it might be possible that the slug is undefined but the path or parentInputId is not. 
        // In that case, we need to fetch the current slug
        if (!slug.value) {
            if (meta.keys.length > 1) throw new EditMultipleParentsError();
            const currentItem = await findExistingItems(meta.keys, meta.collection, { fields: [slug.key] }, eventContext, hookContext);
            if (!currentItem || !currentItem[0]) return;
            slug = {
                key: slug.key,
                value: currentItem[0][slug.key]
            } 
        }

        // Then, we need to check if a path, and ONLY a path is provided. This would happen if the parent is changed, and this triggered a child update. In that case we need to manually set the path value
        let path = null
        if (Object.keys(payload).length === 1 && pathField && (payload as Record<string, any>)[pathField.field]) {
            path = {
                key: pathField.field,
                value: (payload as Record<string, any>)[pathField.field]
            }
        }
        else path = await getPathValue(payload, meta, { pathField, slug: slug as { key: string, value: string } }, eventContext, hookContext);
        
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

        /* 
            if a path value is changed, and if a parentFieldKey is defined, we need to trigger updates to any of the items children.
            BECAUSE if a parent value is changed, the child's value need to be updated as well!
            This needs to be done by trigger a new update hook for the children. This ensures that the proces is recursive
        */
        if (parentFieldKey) {
            const children = await findChildren(
                meta.keys,
                meta.collection,
                parentFieldKey,
                slug.key,
                eventContext,
                hookContext
            )
            // Only if the item has children, we need to trigger the update hook for the children
            // This hook should only be triggered though, AFTER the current item has been updated
            if (children.length) {
                if (meta.keys.length > 1) throw new EditMultipleParentsChildrenError();
                hookContext.emitter.emitAction('force-child.update', {
                    children,
                    pathFieldKey: path.key,
                    parentPathValue: path.value,
                    collection: meta.collection,
                }, eventContext)
            }
        }

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
            // the delete event meta does not contain the item keys, these are the payload!
            {
                ...meta,
                keys: payload as PrimaryKey[]
            },
            eventContext,
            hookContext
        )
    });


    // This hook is triggered by the update hook, and is used to update the children of an item, without modifying the child's data. This is done by reassigning the parent ID to the child.
    hookContext.emitter.onAction('force-child.update', async (payload: { children: { id: PrimaryKey, slug: string }[], pathFieldKey: string, parentPathValue: string, collection: string }, eventContext: EventContext) => {
        const { children, pathFieldKey, parentPathValue, collection } = payload;
        const { ItemsService } = hookContext.services;
        const items = new ItemsService(collection, eventContext);

        await items.updateBatch(
            children.map(child => ({
                id: child.id,
                [pathFieldKey]: parentPathValue.endsWith('/') ? `${parentPathValue}${child.slug}/` : `${parentPathValue}/${child.slug}`
            }))
        )
    })
});