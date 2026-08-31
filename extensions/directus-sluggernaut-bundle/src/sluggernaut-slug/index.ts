/** Registers the Sluggernaut slug interface in Directus Studio. */
import { defineInterface } from '@directus/extensions-sdk'

import { createRedirectInterfaceOptions } from '../shared/configuration/interface-options'
import { locales } from '../shared/configuration/locales'
import SlugInterface from './interface.vue'

export default defineInterface({
	id: 'sluggernaut-slug',
	name: 'Sluggernaut Slug',
	icon: 'link',
	description: 'Editable-but-locked slug field managed by Sluggernaut.',
	component: SlugInterface,
	types: ['string'],
	group: 'standard',
	/**
	 * Defines the field configuration shown in Directus Studio.
	 * @param context - Interface context.
	 * @returns Sluggernaut interface option definitions.
	 */
	options: (context) => {
		const collection = context.collection ?? ''

		return [
			{
				field: 'sourceFields',
				name: 'Source fields',
				type: 'json',
				required: true,
				meta: {
					width: 'full',
					interface: 'system-field',
					options: {
						collectionName: collection,
						typeAllowList: ['string'],
						allowNone: false,
						multiple: true,
						allowOther: false,
					},
					note: 'Fields whose values are combined to generate the slug.',
				},
			},
			{
				field: 'locale',
				name: 'Locale',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'select-dropdown',
					options: {
						choices: locales.map((locale) => ({
							text: locale.label,
							value: locale.value,
						})),
						allowOther: false,
					},
					note: 'The locale determines the character set used for the slug',
				},
				schema: { default_value: 'nl' },
			},
			{
				field: 'lowercase',
				name: 'Lowercase',
				type: 'boolean',
				meta: { width: 'half', interface: 'checkbox' },
				schema: { default_value: true },
			},
			{
				field: 'updateOnSourceChange',
				name: 'Update on source change',
				type: 'boolean',
				meta: { width: 'half', interface: 'checkbox' },
				schema: { default_value: true },
			},
			...createRedirectInterfaceOptions(),
		]
	},
})
