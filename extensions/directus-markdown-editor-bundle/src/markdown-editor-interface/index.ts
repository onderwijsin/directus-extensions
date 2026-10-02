import { defineInterface } from '@directus/extensions-sdk'
import { iconifyCollectionChoices } from '@onderwijsin/directus-extension-utils/app'

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
			rule: Record<string, { _eq?: boolean | string; _neq?: string }>
			hidden: boolean
		}[]
		options?: {
			allowNone?: boolean
			showDeselect?: boolean
			choices?: { text: string; value: string }[]
			language?: string
			allowOther?: boolean
		}
	}
	schema?: { default_value: string[] | boolean | string }
}

/**
 * Create the configurable fields displayed for this interface in Directus.
 * @returns Directus interface option definitions.
 */
export function createMarkdownEditorOptions(): MarkdownEditorOption[] {
	return [
		{
			field: 'ai',
			name: 'Enable AI editing',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Show AI actions for this field. Server provider configuration and permissions are also required.',
			},
			schema: { default_value: false },
		},
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
					showDeselect: true,
					choices: [...editorToolOptions.map(({ text, value }) => ({ text, value }))],
				},
			},
			schema: { default_value: [] },
		},
		{
			field: 'assetStorageMode',
			name: 'Store selected assets as',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'select-dropdown',
				note: 'Format used when selecting Directus images in Markdown or component properties.',
				options: {
					choices: [
						{ text: 'Asset ID', value: 'id' },
						{ text: 'Relative asset path', value: 'path' },
						{ text: 'Absolute asset URL', value: 'url' },
					],
				},
			},
			schema: { default_value: 'path' },
		},
		{
			field: 'assetBaseUrl',
			name: 'Asset base URL',
			type: 'string',
			required: true,
			meta: {
				width: 'full',
				note: 'HTTP(S) Directus base URL, for example https://directus.example.com.',
				conditions: [{ rule: { assetStorageMode: { _neq: 'url' } }, hidden: true }],
			},
		},
		{
			field: 'useStaticComponentMeta',
			name: 'Use static component metadata',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Use component metadata stored directly in this interface configuration.',
			},
			schema: { default_value: false },
		},
		{
			field: 'useReferences',
			name: 'Use item references',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Allow authors to insert permission-aware references to configured Directus items.',
			},
			schema: { default_value: false },
		},
		{
			field: 'referenceCollections',
			name: 'Reference collections',
			type: 'json',
			required: true,
			meta: {
				width: 'full',
				interface: 'input-code',
				note: 'JSON array, for example [{"collection":"articles","displayField":"title","searchFields":["title","slug"],"dataFields":["slug"]}].',
				conditions: [{ rule: { useReferences: { _eq: false } }, hidden: true }],
				options: { language: 'json' },
			},
		},
		{
			field: 'enableReferenceIcon',
			name: 'Enable reference icon',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Allow authors to choose an Iconify icon for references.',
				conditions: [{ rule: { useReferences: { _eq: false } }, hidden: true }],
			},
			schema: { default_value: false },
		},
		{
			field: 'iconifyCollections',
			name: 'Iconify collections',
			type: 'json',
			meta: {
				width: 'full',
				interface: 'select-multiple-dropdown',
				note: 'Collections available for reference icons. Component icon properties use their own metadata config. Leave empty for all collections.',
				options: {
					choices: iconifyCollectionChoices,
					allowNone: true,
					allowOther: false,
				},
			},
			schema: { default_value: [] },
		},
		{
			field: 'useIconifyProxy',
			name: 'Use Iconify API proxy',
			type: 'boolean',
			meta: {
				width: 'full',
				interface: 'checkbox',
				note: 'Requires directus-iconify-bundle to be installed. Otherwise icons load directly from Iconify.',
			},
			schema: { default_value: false },
		},
		{
			field: 'referenceSnapshotMode',
			name: 'Reference snapshot mode',
			type: 'string',
			meta: {
				width: 'full',
				interface: 'select-dropdown',
				note: 'References store a copy of the source label and data when inserted. Snapshot only checks whether the source is available or archived. Detect source changes (default) also flags changed labels or data for manual refresh. Synchronize on load updates changed labels and data in the editor; you must still save the document.',
				conditions: [{ rule: { useReferences: { _eq: false } }, hidden: true }],
				options: {
					choices: [
						{ text: 'Snapshot only', value: 'snapshot' },
						{ text: 'Detect source changes', value: 'detect' },
						{ text: 'Synchronize on load', value: 'sync' },
					],
				},
			},
			schema: { default_value: 'detect' },
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
