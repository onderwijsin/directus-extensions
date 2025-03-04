import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'opath_interface',
	name: 'Path',
	icon: 'link',
	description: 'Readonly field for item paths',
	component: InterfaceComponent,
	options: ({collection}) => {
		return [
			{
				field: 'parent',
				name: 'Parent field',
				type: 'string',
				required: false,
				meta: {
					width: 'full',
					required: false,
					interface: "system-field",
					options: {
						collectionName: collection,
						typeAllowList: ["string", "integer", "uuid"],
						allowNone: true,
						multiple: false,
						allowOther: false
					},
					note: 'What is the parent field for the collection? (optional)'
				},
			}
		]
	},
	types: ['string'],
	group: 'standard',
	recommendedDisplays: ['olink_display'],
});
