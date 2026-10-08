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
			name: 'Maximum Files Selected',
			type: 'integer',
			schema: { default_value: 100 },
			meta: { interface: 'input', width: 'half', note: '1–1000 per run.' },
		},
		{
			field: 'concurrency',
			name: 'Concurrency',
			type: 'integer',
			schema: { default_value: 1 },
			meta: {
				interface: 'input',
				width: 'half',
				note: '1–100 active files. Start low; this is not a rate limiter.',
			},
		},
		{
			field: 'afterId',
			name: 'Resume After File ID',
			type: 'string',
			meta: {
				interface: 'input',
				width: 'full',
				note: 'Use nextCursor for regeneration or bounded metadata scans. Leave empty for routine missing-only backfills.',
			},
		},
		{
			field: 'excludeFiles',
			name: 'Exclude File IDs',
			type: 'json',
			meta: {
				interface: 'input-code',
				width: 'full',
				options: { language: 'json' },
				note: 'JSON array of up to 1000 UUIDs. Exclude permanent failures to allow later work; retry them with the explicit-file operation.',
			},
		},
		...metadataAppOptions,
	],
})
