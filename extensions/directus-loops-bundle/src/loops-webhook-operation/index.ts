import { defineOperationApp } from '@directus/extensions-sdk'

export default defineOperationApp({
	id: 'loops-webhook-handler',
	name: 'Loops Webhook Handler',
	icon: 'mail',
	description: 'Process a verified Loops webhook payload.',
	overview: null,
	options: [],
})
