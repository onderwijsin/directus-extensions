import IconifyOptions from './options.vue'
import IconifyPicker from './picker.vue'

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
	options: IconifyOptions,
}
