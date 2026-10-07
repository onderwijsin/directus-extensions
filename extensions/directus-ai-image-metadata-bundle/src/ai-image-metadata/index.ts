import { defineOperationApp } from '@directus/extensions-sdk'

import { metadataAppOptions } from '../shared/app-options'

export default defineOperationApp({
	id: 'ai-image-metadata',
	name: 'AI Image Metadata',
	icon: 'image_search',
	overview: null,
	description: 'Generate accessible descriptions and optional image metadata.',
	options: [
		{
			field: 'files',
			name: 'File IDs',
			type: 'json',
			meta: {
				interface: 'input-code',
				options: { language: 'json' },
				width: 'full',
				required: true,
				note: 'A UUID or UUID array, e.g. {{$trigger.key}} for files.upload.',
			},
		},
		...metadataAppOptions,
	],
})
