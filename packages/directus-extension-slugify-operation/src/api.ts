import { locales, extensions } from './constants';
import { defineOperationApi } from '@directus/extensions-sdk';
import slugify from 'slugify';
import type { PrimaryKey, Accountability } from '@directus/types';
import type { ItemsService } from '@directus/api/dist/services';
import { createError } from '@directus/errors';
slugify.extend(extensions)

const localeValues = locales.map((locale) => locale.value);
type Locale = typeof localeValues[number];

type Options = {
	fields?: string[];
	output_key?: string;
	locale?: Locale
	make_unique?: boolean;
	lowercase?: boolean;
};

interface Data {
	$trigger?: {
		payload?: {
			[key: string]: string;
		}
		event: string
		collection: string;
		keys: Array<PrimaryKey>
	};
	$accountability?: Accountability
	
}


const EditMultipleError = createError(
    'INVALID_PAYLOAD_ERROR',
    "Editing multiple items of a collection with multiple slug input fields, without providing each input, is not supported. Please edit one item at a time.",
    400
);

function randomString(length: number): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

	
export default defineOperationApi<Options>({
	id: 'slugify',
	handler: async ({ fields, output_key, locale, make_unique, lowercase }, context) => {
		const { data }: { data: Data } = context;

		if (!data.$trigger || !data.$trigger.payload) return {}


		// Apply default options, since directus does not support default values in flows
		if (!fields?.length) fields = ['title'];
		if (!output_key) output_key = 'slug';
		if (!locale) locale = 'nl';
		else if (locale === 'en') locale = undefined; // Slugify uses 'en' as default locale
		if (make_unique === undefined) make_unique = false;
		if (lowercase === undefined) lowercase = true;


		// If slug was manually provided, use that as a value
		let value = ''
		if  (data.$trigger.payload[output_key]) {
			value = (data.$trigger as any).payload[output_key]
		} else {
			let values = fields.map(field => data.$trigger?.payload?.[field]).filter(Boolean);

			// If not all fields are filled and the trigger is an update event, fetch existing values for unmodified fields
			// We cant differentiate output for multiple keys, so we only support a single key
			// If multiple items were edited, we'll only use the input key
			if (!!values.length && values.length < fields.length && data.$trigger?.event.includes('.update')) {
				if (data.$trigger.keys.length > 1) throw new EditMultipleError();
				const missingValues = fields.filter(field => !data.$trigger?.payload?.[field])

				const { services, getSchema } = context;
				const { ItemsService }= services;
				const itemsService: ItemsService = new ItemsService(data.$trigger.collection, {
					schema: await getSchema(),
					accountability: data.$accountability,
					knex: context.database
				});

				const item = await itemsService.readMany(data.$trigger.keys, {
					fields: missingValues
				})

				values = fields.map(field => data.$trigger?.payload?.[field] || item[0]?.[field]).filter(Boolean);
			}

			value = values.join('-')
		}

		
		// If no relevant input was provided return trigger data.
		if (!value) return { ...(data.$trigger as any).payload };

		// Slugify the value with options
		let slug = slugify(value, {
			replacement: '-',
			locale: locale,
			lower: lowercase,
			trim: true,
			strict: true,
			remove: /[*+~.()'"?!:@]/g
		});

		if (make_unique) {
			slug += `-${randomString(6)}`;
		}


		return {
			...data.$trigger.payload,
			[output_key]: slug
		};


	},
});
