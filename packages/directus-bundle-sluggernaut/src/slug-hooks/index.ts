import { defineHook } from '@directus/extensions-sdk';
import type { Field, FieldMeta, PrimaryKey } from '@directus/types';
import { slugifyInputs } from './slugify';
import type { FieldsService, ItemsService } from '@directus/api/dist/services';



const getSlugValue = async (payload: Object, meta: Record<string, any>, context: any, service: FieldsService) => {
	// Find fields belonging to the collection, so we can check if the slug interface is used
	const collectionFields = await service.readAll(meta.collection)
	const slugField = collectionFields.find((field: Field) => field.meta?.interface === 'oslug_interface')

	// If no slug interface was use, we dont need to slugify anything
	if (!slugField) return

	// Check if hook has bind to create only, and is currently an update event
	if (slugField.meta?.options?.on_create && meta.event !== 'items.create') return;


	// Check if input field values were provided
	const hasInput = (slugField.meta as FieldMeta).options?.fields.some((field: string) => payload.hasOwnProperty(field));

	// Check if any input values were provided for the slug. This can either be an input field, or the slug field itself
	if (!hasInput && !payload.hasOwnProperty(slugField.field)) return;

	return {
		key: slugField.field,
		value: await slugifyInputs(meta, payload, context, {
			fields: slugField.meta?.options?.fields,
			output_key: slugField.field,
			locale: slugField.meta?.options?.locale,
			make_unique: slugField.meta?.options?.make_unique,
			lowercase: slugField.meta?.options?.lowercase
		})
	}
}

export default defineHook((
	{ filter }, 
	context
) => {
	const { services, emitter, getSchema } = context
	
	
	filter('items.create', async (payload, meta) => {
		if (!payload || typeof payload !== 'object') return;

		const { FieldsService } = services;

		const fields: FieldsService = new FieldsService({
			schema: await getSchema()
		})

		const slug = await getSlugValue(payload, meta, context, fields);

		if (!slug?.value) return;

		return {
			...payload,
			[slug.key]: slug.value
		}
		
	});

	filter('items.update', async (payload, meta, { accountability }) => {
		if (!payload || typeof payload !== 'object') return;

		const { FieldsService } = services;

		const fields: FieldsService = new FieldsService({
			schema: await getSchema()
		})

		const slug = await getSlugValue(payload, meta, context, fields);

		// TODO implement slug.delete event if status was changed from published to something else

		if (!slug?.value) return;

		const { ItemsService }= services;
		const itemsService: ItemsService = new ItemsService(meta.collection, {
			schema: await getSchema(),
			accountability
		});

		const items = await itemsService.readMany(payload as PrimaryKey[], {
			fields: [slug.key]	
		})


		emitter.emitAction('slug.update', {
			oldValues: items.map((item: Record<string, any>) => item[slug.key]),
			newValue: slug.value,
			collection: meta.collection
		})

		return {
			...payload,
			[slug.key]: slug.value
		}
		
	});


	filter('items.delete', async (payload, meta, { accountability }) => {
		const { FieldsService } = services;

		const fields: FieldsService = new FieldsService({
			schema: await getSchema()
		})
		const collectionFields = await fields.readAll(meta.collection)
		const slugField = collectionFields.find((field: Field) => field.meta?.interface === 'oslug_interface')
		
		if (!slugField) return;

		const slugKey = slugField.field;

		const { ItemsService }= services;
		const itemsService: ItemsService = new ItemsService(meta.collection, {
			schema: await getSchema(),
			accountability
		});

		const items = await itemsService.readMany(payload as PrimaryKey[], {
			fields: [slugKey]	
		})

		emitter.emitAction('slug.delete', {
			slugs: items.map((item: Record<string, any>) => item[slugKey])
		})

	});

});
