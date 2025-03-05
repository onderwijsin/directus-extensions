import { defineHook } from '@directus/extensions-sdk';
import { SYNC_CONFIG } from './config';

export default defineHook(({ filter, action }, context) => {
	filter('items.create', () => {
		console.log('Creating Item!');
	});

	action('items.create', () => {
		console.log('Item created!');
	});
});
