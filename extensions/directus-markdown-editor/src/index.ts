import { defineInterface } from '@directus/extensions-sdk'

import { editorToolOptions } from './editor/commands'
import MarkdownEditor from './MarkdownEditor.vue'

// Directus option factories are extension registration metadata, not public API functions.
interface MarkdownEditorOption {
	field: string
	name: string
	type: 'json' | 'string' | 'boolean'
	meta: {
		width: 'full' | 'half'
		interface?: string
		note: string
		options?: {
			allowNone: boolean
			choices: { text: string; value: string }[]
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
			field: 'metadataUrl',
			name: 'Component metadata URL',
			type: 'string',
			meta: {
				width: 'full',
				note: 'Optional JSON URL containing the project components available in the editor.',
			},
		},
		{
			field: 'useMockMetadata',
			name: 'Use mock component metadata',
			type: 'boolean',
			meta: {
				width: 'half',
				note: 'Temporary test fixture with Hero, Callout, and Icon components; bypasses the metadata URL.',
			},
			schema: { default_value: true },
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
