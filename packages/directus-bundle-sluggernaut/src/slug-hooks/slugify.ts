import { createError } from '@directus/errors';
import { extensions } from './constants';
import slugify from 'slugify';
import type { ItemsService } from '@directus/api/dist/services';

slugify.extend(extensions)

type Options = {
	fields: string[];
	output_key: string;
	locale?: string
	make_unique?: boolean;
	lowercase?: boolean;
};


function randomString(length: number): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const charactersLength = characters.length;
	for (let i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

const EditMultipleError = createError('INVALID_PAYLOAD_ERROR', "Editing multiple items of a collection with multiple slug input fields, without providing each input, is not supported. Please edit one item at a time.", 400);



export const slugifyInputs = async (
    meta: Record<string, any>,
    payload: Record<string, any>,
    context: any,
    { fields, output_key, locale, make_unique, lowercase }: Options
) => {
    // Apply default options, since directus does not support default values in flows
    if (!locale) locale = 'nl';
    else if (locale === 'en') locale = undefined; // Slugify uses 'en' as default locale
    if (make_unique === undefined) make_unique = false;
    if (lowercase === undefined) lowercase = true;


    // If slug was manually provided, use that as a value
    let value = ''
    if  (payload.hasOwnProperty(output_key) && !!payload[output_key]) {
        value = payload[output_key]
    } else {
        let values = fields.map(field => payload[field]).filter(Boolean);

        // If not all fields are filled and the trigger is an update event, fetch existing values for unmodified fields
        // We cant differentiate output for multiple keys, so we only support a single key
        // If multiple items were edited, we'll only use the input key
        if (!!values.length && values.length < fields.length && meta.event.includes('.update')) {
            if (meta.keys.length > 1) throw new EditMultipleError()
            const missingValues = fields.filter(field => !payload?.[field])

            const { services, getSchema } = context;
            const { ItemsService }= services;
            const itemsService: ItemsService = new ItemsService(meta.collection, {
                schema: await getSchema(),
            });

            const item = await itemsService.readMany(meta.keys, {
                fields: missingValues
            })

            values = fields.map(field => payload?.[field] || item[0]?.[field]).filter(Boolean);
        }

        value = values.join('-')
    }

    
    // If no relevant input was provided return null
    if (!value) return null

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

    return slug
}