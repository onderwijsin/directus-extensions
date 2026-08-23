/** Registers the Sluggernaut permalink interface in Directus Studio. */
import { defineInterface } from '@directus/extensions-sdk'

import { createRedirectInterfaceOptions } from '../shared/configuration/interface-options'
import PermalinkInterface from './interface.vue'

const generatedFromSlugCondition = [
	{
		rule: {
			generateFromSlug: {
				_eq: false,
			},
		},
		hidden: true,
	},
]

export default defineInterface({
	id: 'sluggernaut-permalink',
	name: 'Sluggernaut Permalink',
	icon: 'link',
	description: 'Editable-but-locked absolute URL path managed by Sluggernaut.',
	component: PermalinkInterface,
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
				field: 'generateFromSlug',
				name: 'Generate from slug',
				type: 'boolean',
				meta: { width: 'half', interface: 'checkbox' },
				schema: { default_value: true },
			},
			{
				field: 'slugField',
				name: 'Slug field',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'system-field',
					conditions: generatedFromSlugCondition,
					options: {
						collectionName: collection,
						typeAllowList: ['string'],
						allowNone: true,
						multiple: false,
					},
					note: 'Must reference a Sluggernaut slug field in this collection.',
				},
			},
			{
				field: 'updateOnSlugChange',
				name: 'Update on slug change',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'checkbox',
					conditions: generatedFromSlugCondition,
				},
				schema: { default_value: false },
			},
			{
				field: 'prefix',
				name: 'Prefix',
				type: 'string',
				meta: {
					width: 'half',
					interface: 'input',
					conditions: generatedFromSlugCondition,
				},
			},
			{
				field: 'validatePrefixOnManualInput',
				name: 'Validate prefix on manual input',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'checkbox',
					conditions: generatedFromSlugCondition,
				},
				schema: { default_value: false },
			},
			{
				field: 'trailingSlash',
				name: 'Trailing slash',
				type: 'boolean',
				meta: { width: 'half', interface: 'checkbox' },
				schema: { default_value: false },
			},
			{
				field: 'enforceTrailingSlashOnManualInput',
				name: 'Enforce trailing slash on manual input',
				type: 'boolean',
				meta: { width: 'half', interface: 'checkbox' },
				schema: { default_value: false },
			},
			...createRedirectInterfaceOptions(),
		]
	},
})
