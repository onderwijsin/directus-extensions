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
	// The built-in system-folder interface selects one UUID, not a folder array with root entries.
	{
		field: 'includeFolders',
		name: 'Include Folder IDs',
		type: 'json',
		schema: { default_value: [] },
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			width: 'full',
			note: 'UUID array; null selects the root. Exact folders, without descendants.',
		},
	},
	{
		field: 'excludeFolders',
		name: 'Exclude Folder IDs',
		type: 'json',
		schema: { default_value: [] },
		meta: {
			interface: 'input-code',
			options: { language: 'json' },
			width: 'full',
			note: 'UUID array; exclusion wins. Null excludes root files.',
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
		field: 'generateFilename',
		name: 'Generate Download Filename',
		type: 'boolean',
		schema: { default_value: false },
		meta: { interface: 'boolean', width: 'half' },
	},
	{
		field: 'overwriteAltText',
		name: 'Overwrite Alt Text',
		type: 'boolean',
		schema: { default_value: false },
		meta: {
			interface: 'boolean',
			width: 'full',
			note: 'Replace an existing description; otherwise only fill missing alt text.',
		},
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
] satisfies OperationAppConfig['options']
