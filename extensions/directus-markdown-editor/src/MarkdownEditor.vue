<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
import { ref, toRef, watch } from 'vue'

import { EditorContent, useEditor } from '@tiptap/vue-3'

import ComponentInsertMenu from './components/ComponentInsertMenu.vue'
import EditorContextMenus from './components/EditorContextMenus.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import LinkDrawer from './components/LinkDrawer.vue'
import MediaDrawer from './components/MediaDrawer.vue'
import SourceDrawer from './components/SourceDrawer.vue'
import { useComponentMetadata } from './composables/useComponentMetadata'
import { createEditorCommands } from './editor/commands'
import { createEditorExtensions } from './editor/extensions'
import { createLinkShortcut } from './editor/link'

const props = defineProps<{
	value?: string | null
	disabled?: boolean
	options?: { metadataUrl?: string | null; useMockMetadata?: boolean }
}>()
const emit = defineEmits<{ input: [value: string] }>()
const syncing = ref(false)
const linkDrawerOpen = ref(false)
const mediaDrawerOpen = ref(false)
const mediaDrawerType = ref<'image' | 'video'>('image')
const sourceDrawerOpen = ref(false)

/**
 * Open the shared media drawer in the requested mode.
 * @param type The media type to insert or edit.
 * @returns Nothing.
 */
function openMediaDrawer(type: 'image' | 'video') {
	mediaDrawerType.value = type
	mediaDrawerOpen.value = true
}
const metadata = useComponentMetadata({
	metadataUrl: toRef(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => props.options?.metadataUrl,
	),
	useMockMetadata: toRef(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => props.options?.useMockMetadata ?? true,
	),
})

const extensions = createEditorExtensions(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => metadata.components.value,
)
extensions.push(
	createLinkShortcut(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => (linkDrawerOpen.value = true),
	),
)

const editor = useEditor({
	content: props.value ?? '',
	extensions,
	contentType: 'markdown',
	editorProps: {
		attributes: {
			role: 'textbox',
			'aria-multiline': 'true',
			autocomplete: 'off',
			autocorrect: 'off',
			autocapitalize: 'off',
		},
		handleClick: /**
		 * Open the link drawer instead of navigating from the editor.
		 * @param _view The current editor view.
		 * @param position The clicked document position.
		 * @param event The browser click event.
		 * @returns Whether the click was handled.
		 */ (_view, position, event) => {
			if (!(event.target instanceof HTMLElement) || !event.target.closest('a')) return false
			editor.value?.chain().focus().setTextSelection(position).run()
			linkDrawerOpen.value = true
			return true
		},
		handleDoubleClickOn: /**
		 * Open the image drawer when an image node is double-clicked.
		 * @param _view The current editor view.
		 * @param _position The clicked document position.
		 * @param node The clicked node.
		 * @param nodePosition The node document position.
		 * @returns Whether the double-click was handled.
		 */ (_view, _position, node, nodePosition) => {
			if (node.type.name !== 'image') return false
			editor.value?.commands.setNodeSelection(nodePosition)
			openMediaDrawer('image')
			return true
		},
	},

	onCreate: /**
	 * Editor callback.
	 * @param { editor: instance } Parameter value.
	 * @returns Callback result.
	 */ ({ editor: instance }) => instance.setEditable(!props.disabled),

	onUpdate: /**
	 * Editor callback.
	 * @param { editor: instance, transaction } Parameter value.
	 * @returns Callback result.
	 */ ({ editor: instance, transaction }) => {
		if (!syncing.value && transaction.docChanged) emit('input', instance.getMarkdown())
	},
})

const commands = createEditorCommands()

watch(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.disabled,

	/**
	 * Editor callback.
	 * @param disabled Parameter value.
	 * @returns Callback result.
	 */
	(disabled) => editor.value?.setEditable(!disabled),
)
watch(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.value,

	/**
	 * Editor callback.
	 * @param value Parameter value.
	 * @returns Callback result.
	 */
	(value) => {
		const instance = editor.value
		if (!instance || value === instance.getMarkdown()) return
		syncing.value = true
		instance.commands.setContent(value ?? '', { contentType: 'markdown', emitUpdate: false })
		syncing.value = false
	},
)
</script>

<template>
	<div class="markdown-editor" :class="{ 'is-disabled': disabled }">
		<template v-if="editor">
			<div class="markdown-editor__toolbar-row">
				<EditorToolbar
					:editor="editor"
					:commands="commands"
					:disabled="disabled"
					@open-link="linkDrawerOpen = true"
					@open-image="openMediaDrawer('image')"
					@open-media="openMediaDrawer('video')"
					@open-source="sourceDrawerOpen = true"
				/>
				<ComponentInsertMenu
					:editor="editor"
					:components="metadata.components.value"
					:loading="metadata.state.value === 'loading'"
					:disabled="disabled"
				/>
			</div>
			<p
				v-if="metadata.state.value === 'error'"
				class="markdown-editor__metadata-error"
				role="alert"
			>
				Component metadata could not be loaded. Markdown editing is still available.
			</p>
			<EditorContextMenus
				:editor="editor"
				:commands="commands"
				:disabled="disabled"
				@open-link="linkDrawerOpen = true"
			/>
			<div class="markdown-editor__canvas">
				<EditorContent :editor="editor" />
			</div>
			<LinkDrawer v-model="linkDrawerOpen" :editor="editor" :disabled="disabled" />
			<MediaDrawer
				v-model="mediaDrawerOpen"
				:editor="editor"
				:disabled="disabled"
				:initial-type="mediaDrawerType"
			/>
			<SourceDrawer v-model="sourceDrawerOpen" :editor="editor" :disabled="disabled" />
		</template>
	</div>
</template>

<style scoped>
.markdown-editor {
	--editor-font-family: var(
		--theme--fonts--sans--font-family,
		-apple-system,
		BlinkMacSystemFont,
		'Segoe UI',
		sans-serif
	);
	--editor-foreground: var(--theme--form--field--input--foreground, #1f2937);
	--editor-border: var(--theme--form--field--input--border-color, #d3dce3);
	position: relative;
	min-width: 0;
	border: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--form--field--input--background, white);
}

.markdown-editor__canvas {
	min-height: 12rem;
	padding-block: 1rem;
	padding-inline: 2rem;
}

.markdown-editor__toolbar-row {
	position: sticky;
	top: 0;
	z-index: 5;
	display: flex;
	align-items: center;
	min-width: 0;
	border-block-end: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	background: var(--theme--form--field--input--background-subdued, #f5f7f8);
}

.markdown-editor__toolbar-row :deep(.editor-toolbar) {
	flex: 1 1 auto;
	border-block-end: 0;
}

.markdown-editor__toolbar-row :deep(.component-insert-menu) {
	flex: 0 0 auto;
	padding-inline-end: 0.25rem;
}

:deep(.ProseMirror) {
	min-height: 10rem;
	padding: 1.125rem;
	outline: none;
	color: var(--editor-foreground);
	font-family: var(--editor-font-family);
	font-size: 0.875rem;
	line-height: 1.5714;
	font-weight: 500;
	-webkit-font-smoothing: antialiased;
	text-rendering: optimizeLegibility;
}

:deep(.ProseMirror h1),
:deep(.ProseMirror h2),
:deep(.ProseMirror h3),
:deep(.ProseMirror h4),
:deep(.ProseMirror h5),
:deep(.ProseMirror h6) {
	margin-block-end: 0;
	color: var(--theme--form--field--input--foreground-accent, var(--editor-foreground));
	font-family: var(--editor-font-family);
	font-weight: 700;
}

:deep(.ProseMirror h1) {
	margin-block-start: 1em;
	font-size: 2rem;
	line-height: 1.2813;
}

:deep(.ProseMirror h2) {
	margin-block-start: 1.25em;
	font-size: 1.375rem;
	line-height: 1.4091;
}

:deep(.ProseMirror h3) {
	margin-block-start: 1.25em;
	font-size: 1.0625rem;
	line-height: 1.5294;
}

:deep(.ProseMirror h4) {
	margin-block-start: 1.5em;
	font-size: 0.875rem;
	line-height: 1.6429;
}

:deep(.ProseMirror h5) {
	margin-block-start: 2em;
	font-size: 0.8125rem;
	line-height: 1.6923;
}

:deep(.ProseMirror h6) {
	margin-block-start: 2em;
	font-size: 0.6875rem;
	line-height: 1.8182;
}

:deep(.ProseMirror p),
:deep(.ProseMirror ul),
:deep(.ProseMirror ol) {
	margin-block: 1.5em;
}

:deep(.ProseMirror ul ul),
:deep(.ProseMirror ul ol),
:deep(.ProseMirror ol ul),
:deep(.ProseMirror ol ol) {
	margin-block: 0;
}

:deep(.ProseMirror li),
:deep(.ProseMirror li > p) {
	margin-block: 0;
}

:deep(.ProseMirror a) {
	color: var(--theme--primary-accent, var(--theme--primary, #6644ff));
	text-decoration: underline;
	cursor: pointer;
}

:deep(.ProseMirror strong),
:deep(.ProseMirror b) {
	font-weight: 700;
}

:deep(.ProseMirror code) {
	padding: 0.125rem 0.25rem;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background-normal, #f0f2f5);
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	overflow-wrap: break-word;
}

:deep(.ProseMirror pre) {
	margin-block: 1.5em;
	padding: 1em;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background-normal, #f0f2f5);
	font-family: var(--theme--fonts--monospace--font-family, monospace);
	overflow: auto;
}

:deep(.ProseMirror pre code) {
	padding: 0;
	background: none;
}

:deep(.ProseMirror img) {
	max-inline-size: 100%;
	height: auto;
	border-radius: var(--theme--border-radius, 0.25rem);
}

:deep(.ProseMirror hr) {
	height: 0.0625rem;
	margin-block: 2em;
	border: 0;
	background: var(--editor-border);
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
	float: left;
	height: 0;
	color: var(--theme--foreground-subdued, #8b98a5);
	content: attr(data-placeholder);
	pointer-events: none;
}

:deep(.ProseMirror h1),
:deep(.ProseMirror h2),
:deep(.ProseMirror h3) {
	line-height: 1.25;
}

:deep(.ProseMirror blockquote) {
	margin-block: 1.5em;
	margin-inline: 0;
	padding-inline-start: 1em;
	border-inline-start: 2px solid var(--editor-border);
	color: var(--theme--foreground-subdued, #64748b);
}

:deep(.ProseMirror table) {
	inline-size: 100%;
	margin-block: 1.5em;
	border-collapse: collapse;
	table-layout: fixed;
}

:deep(.ProseMirror th),
:deep(.ProseMirror td) {
	position: relative;
	padding: 0.3125rem;
	border: 0.0625rem solid var(--editor-border);
	vertical-align: top;
	box-sizing: border-box;
}

:deep(.ProseMirror th) {
	background: var(--theme--background-subdued, #f0f2f5);
	font-weight: 700;
	text-align: start;
}

:deep(.ProseMirror .tableWrapper) {
	margin-block: 1.5em;
	overflow-x: auto;
}

.is-disabled {
	opacity: 0.72;
}

.markdown-editor__metadata-error {
	margin: 0;
	padding: 0.5rem 1rem;
	border-block-end: 1px solid var(--theme--border-color, #d3dce3);
	color: var(--theme--danger, #e35169);
	font-size: 0.8rem;
}
</style>
