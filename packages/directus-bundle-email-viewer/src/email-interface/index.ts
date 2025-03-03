import { defineInterface } from '@directus/extensions-sdk';
import InterfaceComponent from './interface.vue';

export default defineInterface({
	id: 'email_history_interface',
	name: 'Email History',
	icon: 'email',
	description: 'List your organization email correspondence for a given email address.',
	component: InterfaceComponent,
	options: ({collection}) => {
		return [
			{
				field: 'email_field',
				name: 'Email field',
				type: 'string',
				required: true,
				meta: {
					width: 'full',
					required: true,
					interface: "system-field",
					options: {
						collectionName: collection,
						typeAllowList: ["string"],
						allowNone: false,
						multiple: false,
						allowOther: false
					},
					note: 'Select the field that holds the email value for the collection'
				},
			}
		]
	},
	hideLabel: true,
	hideLoader: true,
	autoKey: true,
	group: 'presentation',
	types: ['alias'],
	localTypes: ['presentation'],
});
