import { iconifyCollectionChoices } from '@onderwijsin/directus-extension-utils/app'
import IconifyPicker from '@onderwijsin/directus-extension-utils/app/iconify-picker'

/** Registers the Iconify picker for string fields. */
export default {
	id: 'iconify-interface',
	name: 'Iconify Icon',
	icon: 'imagesmode',
	description: 'Select an icon from Iconify collections.',
	component: IconifyPicker,
	types: ['string'],
	group: 'selection',
	recommendedDisplays: ['iconify-display'],
	options: [
		{
			field: 'collections',
			name: 'Icon collections',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'select-multiple-dropdown',
				note: 'Leave empty to include every Iconify collection.',
				options: {
					choices: iconifyCollectionChoices,
					allowNone: true,
					allowOther: false,
				},
			},
			schema: { default_value: [] },
		},
		{
			field: 'useProxy',
			name: 'Use Iconify API proxy',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Request icons through the bundled Directus endpoint.',
			},
			schema: { default_value: true },
		},
	],
}
