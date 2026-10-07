import { defineOperationApp } from '@directus/extensions-sdk'

import { metadataAppOptions } from '../shared/app-options'

export default defineOperationApp({
	id: 'ai-image-metadata-regenerate',
	name: 'AI Image Metadata Regenerate',
	icon: 'image_search',
	overview: null,
	description: 'Generate accessible descriptions and optional image metadata.',
	options: [
		{
			field: 'missingOnly',
			name: 'Only Files With Missing Metadata',
			type: 'boolean',
			schema: { default_value: true },
			meta: { interface: 'boolean', width: 'full' },
		},
		{
			field: 'maxFiles',
			name: 'Maximum Files Scanned',
			type: 'integer',
			schema: { default_value: 100 },
			meta: { interface: 'input', width: 'half', note: '1–1000 per run.' },
		},
		{
			field: 'offset',
			name: 'Resume Offset',
			type: 'integer',
			schema: { default_value: 0 },
			meta: {
				interface: 'input',
				width: 'half',
				note: 'Use nextOffset from the preceding run.',
			},
		},
		...metadataAppOptions,
	],
})
