/** Registers the Sluggernaut permalink interface in Directus Studio. */
import { defineInterface } from '@directus/extensions-sdk'

import { createRedirectInterfaceOptions } from '../shared/configuration/interface-options'
import PermalinkInterface from './interface.vue'

const generatedFromTemplateCondition = [
	{
		rule: {
			generateFromTemplate: {
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
	recommendedDisplays: ['sluggernaut-link'],
	/**
	 * Defines the field configuration shown in Directus Studio.
	 * @param context - Interface context.
	 * @returns Sluggernaut interface option definitions.
	 */
	options: (context) => {
		const collection = context.collection ?? ''

		return [
			{
				field: 'generateFromTemplate',
				name: 'Generate from template',
				type: 'boolean',
				meta: { width: 'full', interface: 'checkbox' },
				schema: { default_value: true },
			},
			{
				field: 'pathTemplate',
				name: 'Path template',
				type: 'string',
				meta: {
					width: 'full',
					interface: 'system-display-template',
					conditions: generatedFromTemplateCondition,
					options: {
						collectionName: collection,
						includeRelations: false,
						placeholder: '/{{type}}/{{slug}}',
					},
					note: 'Use plain scalar fields without defaults, special flags, relations, or generation. Slug sources must follow the same rules. Missing values produce an empty permalink.',
				},
			},
			{
				field: 'templateVariables',
				name: 'Template variables',
				type: 'json',
				meta: {
					width: 'full',
					interface: 'input-code',
					conditions: generatedFromTemplateCondition,
					options: {
						language: 'json',
						template: JSON.stringify(
							[
								{
									name: 'type',
									field: 'type',
									transforms: [
										{
											type: 'map',
											values: { article: 'News Articles', page: 'Pages' },
										},
										{ type: 'slugify' },
										{ type: 'lowercase' },
									],
								},
							],
							null,
							2,
						),
					},
					note: 'Optional array of { name, field, transforms }. Transforms run in order: map (values), slugify, lowercase.',
				},
			},
			{
				field: 'updateOnDependencyChange',
				name: 'Update on dependency change',
				type: 'boolean',
				meta: {
					width: 'half',
					interface: 'checkbox',
					conditions: generatedFromTemplateCondition,
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
