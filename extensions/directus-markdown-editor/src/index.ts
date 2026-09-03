import { defineInterface } from '@directus/extensions-sdk'

import MarkdownEditor from './MarkdownEditor.vue'

// Directus option factories are extension registration metadata, not public API functions.
// oxlint-disable jsdoc/require-returns
/** Register the Directus-native Markdown/MDC editor interface. */
export default defineInterface({
	id: 'markdown-editor',
	name: 'Markdown (MDC)',
	icon: 'edit_note',
	description: 'Edit portable Markdown with generic MDC components.',
	component: MarkdownEditor,
	/**
	 *
	 */
	options: () => [
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
			schema: { default_value: false },
		},
	],
	types: ['text', 'string'],
	group: 'standard',
})
