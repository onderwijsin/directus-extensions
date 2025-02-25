import { defineDisplay } from '@directus/extensions-sdk';
import DisplayComponent from './display.vue';

export default defineDisplay({
	id: 'oslug_display',
	name: 'Slug',
	icon: 'link',
	description: 'Display slug with copy button',
	component: DisplayComponent,
	options: null,
	types: ['string'],
});
