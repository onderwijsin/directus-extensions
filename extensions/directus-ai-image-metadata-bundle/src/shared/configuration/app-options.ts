import type { OperationAppConfig } from '@directus/types'

import { acceptedLanguages } from './languages'

/** Shared Studio options; provider credentials remain on the server. */
export const metadataAppOptions = [
	{
		field: 'language',
		name: 'Metadata Language',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'full',
			options: { choices: acceptedLanguages.map((value) => ({ text: value, value })) },
			note: 'Optional override for alt text, tags, and filename words; defaults to the server language (English when unset).',
		},
	},
	{
		field: 'provider',
		name: 'AI Provider',
		type: 'string',
		meta: {
			interface: 'select-dropdown',
			width: 'full',
			options: {
				choices: ['openai', 'anthropic', 'google', 'mistral', 'openai-compatible'].map(
					(value) => ({ text: value, value }),
				),
			},
			note: 'Optional override; credentials are resolved on the server.',
		},
	},
	{
		field: 'model',
		name: 'AI Model ID',
		type: 'string',
		meta: {
			interface: 'input',
			width: 'full',
			note: 'Optional override; the effective model must support image input and structured output.',
		},
	},
	{
		field: 'prompt',
		name: 'System Prompt',
		type: 'text',
		meta: {
			interface: 'input-multiline',
			width: 'full',
			note: 'Optional replacement for environment/default instructions.',
		},
	},
	{
		field: 'maxImageSizeBytes',
		name: 'Maximum Image Size (bytes)',
		type: 'integer',
		schema: { default_value: 500_000 },
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Larger files trigger WebP encoding. Outputs still above this soft threshold are logged and submitted without another transformation. Default: 500000 bytes (500 kB).',
		},
	},
	{
		field: 'maxImageDimension',
		name: 'Maximum Image Dimension (px)',
		type: 'integer',
		schema: { default_value: 1500 },
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Resize when either dimension exceeds this threshold. Uses Target Image Dimension, capped at this threshold, without cropping or upscaling.',
		},
	},
	{
		field: 'targetImageDimension',
		name: 'Target Image Dimension (px)',
		type: 'integer',
		schema: { default_value: 800 },
		meta: {
			interface: 'input',
			width: 'half',
			note: 'Requested longest edge when resizing is triggered. Capped at Maximum Image Dimension; preserves aspect ratio without cropping or upscaling.',
		},
	},
	{
		field: 'includeFolders',
		name: 'Include Folders',
		type: 'json',
		schema: { default_value: [] },
		meta: {
			interface: 'collection-item-multiple-dropdown',
			options: {
				selectedCollection: 'directus_folders',
				template: '{{ name }}',
				filter: { _and: [{ type: { _eq: 'files' } }] },
			},
			width: 'full',
			note: 'Exact folders, without descendants. Empty selects all folders. Root requires Include Root Folder.',
		},
	},
	{
		field: 'excludeFolders',
		name: 'Exclude Folders',
		type: 'json',
		schema: { default_value: [] },
		meta: {
			interface: 'collection-item-multiple-dropdown',
			options: {
				selectedCollection: 'directus_folders',
				template: '{{ name }}',
				filter: { _and: [{ type: { _eq: 'files' } }] },
			},
			width: 'full',
			note: 'Exact folders; exclusion wins.',
		},
	},
	{
		field: 'includeRoot',
		name: 'Include Root Folder',
		type: 'boolean',
		schema: { default_value: false },
		meta: { interface: 'boolean', width: 'full' },
	},
	{
		field: 'generateAltText',
		name: 'Generate Alt Text',
		type: 'boolean',
		schema: { default_value: true },
		meta: { interface: 'boolean', width: 'half' },
	},
	{
		field: 'overwriteAltText',
		name: 'Overwrite Alt Text',
		type: 'boolean',
		schema: { default_value: false },
		meta: {
			conditions: [{ rule: { generateAltText: { _neq: true } }, hidden: true }],
			interface: 'boolean',
			width: 'half',
			note: 'Replace an existing description; otherwise only fill missing alt text.',
		},
	},
	{
		field: 'generateTags',
		name: 'Generate Tags',
		type: 'boolean',
		schema: { default_value: false },
		meta: { interface: 'boolean', width: 'half' },
	},
	{
		field: 'overwriteTags',
		name: 'Overwrite Tags',
		type: 'boolean',
		schema: { default_value: false },
		meta: {
			conditions: [{ rule: { generateTags: { _neq: true } }, hidden: true }],
			interface: 'boolean',
			width: 'half',
			note: 'Replace existing tags when Generate Tags is enabled.',
		},
	},
	{
		field: 'generateFilename',
		name: 'Generate Download Filename',
		type: 'boolean',
		schema: { default_value: false },
		meta: { interface: 'boolean', width: 'half' },
	},
	{
		field: 'overwriteFilename',
		name: 'Overwrite Filename',
		type: 'boolean',
		schema: { default_value: false },
		meta: {
			conditions: [{ rule: { generateFilename: { _neq: true } }, hidden: true }],
			interface: 'boolean',
			width: 'half',
			note: 'Rename existing download filenames when Generate Download Filename is enabled.',
		},
	},
	{
		field: 'generateFocalPoint',
		name: 'Generate Focal Point',
		type: 'boolean',
		schema: { default_value: false },
		meta: { interface: 'boolean', width: 'half' },
	},
	{
		field: 'overwriteFocalPoint',
		name: 'Overwrite Focal Point',
		type: 'boolean',
		schema: { default_value: false },
		meta: {
			conditions: [{ rule: { generateFocalPoint: { _neq: true } }, hidden: true }],
			interface: 'boolean',
			width: 'half',
			note: 'Replace a complete focal point; otherwise fill incomplete pairs together.',
		},
	},
] satisfies OperationAppConfig['options']
