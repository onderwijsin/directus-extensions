import { defineInterface } from '@directus/extensions-sdk'

import { editorToolOptions } from './editor/commands'
import MarkdownEditor from './MarkdownEditor.vue'

// Directus option factories are extension registration metadata, not public API functions.
interface MarkdownEditorOption {
	field: string
	name: string
	type: 'json' | 'string' | 'boolean'
	required?: boolean
	meta: {
		width: 'full' | 'half'
		interface?: string
		note: string
		conditions?: {
			rule: Record<string, { _eq: boolean }>
			hidden: boolean
		}[]
		options?: {
			allowNone?: boolean
			choices?: { text: string; value: string }[]
			language?: string
		}
	}
	schema?: { default_value: string[] | boolean }
}

/**
 * Create the configurable fields displayed for this interface in Directus.
 * @returns Directus interface option definitions.
 */
export function createMarkdownEditorOptions(): MarkdownEditorOption[] {
	return [
		{
			field: 'tools',
			name: 'Available editor tools',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'select-multiple-dropdown',
				note: 'Choose which formatting and insertion tools editors can use.',
				options: {
					allowNone: true,
					choices: [
						{ text: 'All tools', value: 'all' },
						...editorToolOptions.map(({ text, value }) => ({ text, value })),
					],
				},
			},
			schema: { default_value: ['all'] },
		},
		{
			field: 'useStaticComponentMeta',
			name: 'Use static component metadata',
			type: 'boolean',
			meta: {
				width: 'half',
				interface: 'checkbox',
				note: 'Use component metadata stored directly in this interface configuration.',
			},
			schema: { default_value: false },
		},
		{
			field: 'metadataUrl',
			name: 'Component metadata URL',
			type: 'string',
			meta: {
				width: 'full',
				note: 'Optional JSON URL containing the project components available in the editor.',
				conditions: [
					{
						rule: { useStaticComponentMeta: { _eq: true } },
						hidden: true,
					},
				],
			},
		},
		{
			field: 'staticComponentMeta',
			name: 'Static component metadata',
			type: 'json',
			required: true,
			meta: {
				width: 'full',
				interface: 'input-code',
				note: 'JSON component metadata using the same shape accepted by the remote component metadata endpoint.',
				conditions: [
					{
						rule: { useStaticComponentMeta: { _eq: false } },
						hidden: true,
					},
				],
				options: { language: 'json' },
			},
		},
	]
}

/** Register the Directus-native Markdown/MDC editor interface. */
export default defineInterface({
	id: 'markdown-editor',
	name: 'Markdown (MDC)',
	icon: 'edit_note',
	description: 'Edit portable Markdown with generic MDC components.',
	component: MarkdownEditor,
	/**
	 * @returns Interface option definitions.
	 */
	options: createMarkdownEditorOptions,
	types: ['text', 'string'],
	group: 'standard',
})
