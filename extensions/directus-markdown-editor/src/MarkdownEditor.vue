<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
import { computed, onBeforeUnmount, onMounted, shallowRef, toRef, watch } from 'vue'

import { exitSuggestion } from '@tiptap/suggestion'
import { EditorContent, useEditor } from '@tiptap/vue-3'

import ComponentInsertMenu from './components/ComponentInsertMenu.vue'
import EditorContextMenus from './components/EditorContextMenus.vue'
import EditorTableMenu from './components/EditorTableMenu.vue'
import EditorToolbar from './components/EditorToolbar.vue'
import LinkDrawer from './components/LinkDrawer.vue'
import MediaDrawer from './components/MediaDrawer.vue'
import SourceDrawer from './components/SourceDrawer.vue'
import { useComponentMetadata } from './composables/useComponentMetadata'
import { refreshCodeHighlighting } from './editor/code-block'
import { createEditorCommands, filterEditorCommands, isEditorToolEnabled } from './editor/commands'
import { createEditorExtensions } from './editor/extensions'
import { createLinkShortcut } from './editor/link'
import { synchronizeEditorMarkdown } from './editor/synchronization'

const props = withDefaults(
	defineProps<{
		value?: string | null
		disabled?: boolean
		metadataUrl?: string | null
		useStaticComponentMeta?: boolean
		staticComponentMeta?: unknown
		tools?: string[] | null
		options?: {
			metadataUrl?: string | null
			useStaticComponentMeta?: boolean
			staticComponentMeta?: unknown
			tools?: string[] | null
		}
	}>(),
	{ useStaticComponentMeta: undefined },
)
const emit = defineEmits<{ input: [value: string] }>()
const syncing = shallowRef(false)
const linkDrawerOpen = shallowRef(false)
const mediaDrawerOpen = shallowRef(false)
const mediaDrawerType = shallowRef<'image' | 'video'>('image')
const sourceDrawerOpen = shallowRef(false)
const componentInsertOpen = shallowRef(false)
const fullscreen = shallowRef(false)
const lastEmittedValue = shallowRef<string>()
const darkMode = shallowRef(false)
const enabledTools = computed(() => props.tools ?? props.options?.tools)
let themeObserver: MutationObserver | undefined

/**
 * Mirror the Directus shell theme onto this editor instance.
 * @returns Nothing.
 */
function updateDarkMode() {
	darkMode.value =
		document.body.classList.contains('dark') ||
		document.documentElement.classList.contains('dark') ||
		document.body.dataset.theme === 'dark' ||
		document.documentElement.dataset.theme === 'dark'
}

onMounted(() => {
	updateDarkMode()
	themeObserver = new MutationObserver(updateDarkMode)
	themeObserver.observe(document.body, {
		attributes: true,
		attributeFilter: ['class', 'data-theme'],
	})
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class', 'data-theme'],
	})
	window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
	themeObserver?.disconnect()
	window.removeEventListener('keydown', handleEscape)
})

/**
 * Open the shared media drawer in the requested mode.
 * @param type The media type to insert or edit.
 * @returns Nothing.
 */
function openMediaDrawer(type: 'image' | 'video') {
	if (props.disabled || editor.value?.isEditable !== true) return
	dismissSlashMenu()
	mediaDrawerType.value = type
	mediaDrawerOpen.value = true
}

/** @returns Whether editor-owned controls may open or mutate content. */
function canInteract() {
	return !props.disabled && editor.value?.isEditable === true
}

/**
 * Dismiss the slash suggestion before opening another editor surface.
 * @returns Nothing.
 */
function dismissSlashMenu() {
	const instance = editor.value
	if (instance && !instance.isDestroyed) exitSuggestion(instance.view)
}

/**
 * Dismiss slash suggestions when another editor control is activated.
 * @param event Pointer event from the editor surface.
 * @returns Nothing.
 */
function handleEditorPointerDown(event: PointerEvent) {
	if (!(event.target instanceof Element) || event.target.closest('.slash-menu')) return
	dismissSlashMenu()
}

/** @returns Nothing. */
function openLinkDrawer() {
	if (!canInteract()) return
	dismissSlashMenu()
	linkDrawerOpen.value = true
}

/** @returns Nothing. */
function openSourceDrawer() {
	if (!canInteract()) return
	dismissSlashMenu()
	sourceDrawerOpen.value = true
}

/** @returns Nothing. */
function openComponentInsert() {
	if (!canInteract()) return
	dismissSlashMenu()
	componentInsertOpen.value = true
}

/**
 * Toggle the editor's viewport-filling mode.
 * @returns Nothing.
 */
function toggleFullscreen() {
	if (!canInteract()) return
	dismissSlashMenu()
	fullscreen.value = !fullscreen.value
}

/**
 * Exit full screen when Escape is pressed anywhere in the viewport.
 * @param event Keyboard event from the viewport.
 * @returns Nothing.
 */
function handleEscape(event: KeyboardEvent) {
	if (event.key === 'Escape' && fullscreen.value) fullscreen.value = false
}

/**
 * Open the media drawer for image insertion.
 * @returns Nothing.
 */
function openImageDrawer() {
	openMediaDrawer('image')
}

/**
 * Open the media drawer for video insertion.
 * @returns Nothing.
 */
function openVideoDrawer() {
	openMediaDrawer('video')
}

const metadata = useComponentMetadata({
	metadataUrl: toRef(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => props.metadataUrl ?? props.options?.metadataUrl,
	),
	useStaticComponentMeta: toRef(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => props.useStaticComponentMeta ?? props.options?.useStaticComponentMeta ?? false,
	),
	staticComponentMeta: toRef(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => props.staticComponentMeta ?? props.options?.staticComponentMeta,
	),
})

const extensions = createEditorExtensions(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => metadata.components.value,
	{
		openImage: openImageDrawer,
		openVideo: openVideoDrawer,
	},
	() => enabledTools.value,
)
extensions.push(
	createLinkShortcut(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		openLinkDrawer,
		() => isEditorToolEnabled(enabledTools.value, 'link'),
	),
)

const editor = useEditor({
	content: props.value ?? '',
	extensions,
	contentType: 'markdown',
	editable: !props.disabled,
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
			if (!canInteract()) return false
			editor.value?.chain().focus().setTextSelection(position).run()
			openLinkDrawer()
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
			if (!canInteract()) return false
			if (node.type.name !== 'image' || !isEditorToolEnabled(enabledTools.value, 'image')) {
				return false
			}
			editor.value?.commands.setNodeSelection(nodePosition)
			openMediaDrawer('image')
			return true
		},
	},

	onUpdate: /**
	 * Editor callback.
	 * @param { editor: instance, transaction } Parameter value.
	 * @returns Callback result.
	 */ ({ editor: instance, transaction }) => {
		if (!syncing.value && transaction.docChanged) {
			const value = instance.getMarkdown()
			lastEmittedValue.value = value
			emit('input', value)
		}
	},
})

const commands = computed(() => filterEditorCommands(createEditorCommands(), enabledTools.value))

watch(
	[editor, () => props.disabled],
	/**
	 * Keep editability and syntax highlighting synchronized across Directus version modes.
	 * @param values Current editor instance and disabled state.
	 * @returns Nothing.
	 */
	(values) => {
		const [instance, disabled] = values
		if (!instance) return
		instance.setEditable(!disabled)
		if (disabled) {
			linkDrawerOpen.value = false
			mediaDrawerOpen.value = false
			sourceDrawerOpen.value = false
			componentInsertOpen.value = false
			fullscreen.value = false
		}
		void refreshCodeHighlighting(instance).catch(() => undefined)
	},
	{ immediate: true, flush: 'post' },
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
		if (!instance || instance.isDestroyed) return
		if (value === lastEmittedValue.value) {
			lastEmittedValue.value = undefined
			return
		}
		syncing.value = true
		try {
			synchronizeEditorMarkdown(instance, value ?? '')
		} finally {
			syncing.value = false
		}
	},
	{ flush: 'post' },
)
</script>

<template>
	<div
		class="markdown-editor"
		:class="{ 'is-disabled': disabled, 'is-dark': darkMode, 'is-fullscreen': fullscreen }"
		@pointerdown.capture="handleEditorPointerDown"
	>
		<template v-if="editor">
			<div class="markdown-editor__toolbar-row">
				<EditorToolbar
					:editor="editor"
					:commands="commands"
					:enabled-tools="enabledTools"
					:disabled="disabled"
					:fullscreen="fullscreen"
					@open-link="openLinkDrawer"
					@open-image="openMediaDrawer('image')"
					@open-media="openMediaDrawer('video')"
					@open-source="openSourceDrawer"
					@open-components="openComponentInsert"
					@toggle-fullscreen="toggleFullscreen"
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
				:enabled-tools="enabledTools"
				:disabled="disabled"
				@open-link="openLinkDrawer"
				@open-components="openComponentInsert"
			/>
			<EditorTableMenu :editor="editor" :commands="commands" :disabled="disabled" />
			<div class="markdown-editor__canvas">
				<EditorContent :editor="editor" />
			</div>
			<LinkDrawer
				v-if="isEditorToolEnabled(enabledTools, 'link')"
				v-model="linkDrawerOpen"
				:editor="editor"
				:disabled="disabled"
			/>
			<MediaDrawer
				v-if="
					isEditorToolEnabled(enabledTools, 'image') ||
					isEditorToolEnabled(enabledTools, 'video')
				"
				v-model="mediaDrawerOpen"
				:editor="editor"
				:disabled="disabled"
				:initial-type="mediaDrawerType"
			/>
			<SourceDrawer
				v-if="isEditorToolEnabled(enabledTools, 'source')"
				v-model="sourceDrawerOpen"
				:editor="editor"
				:disabled="disabled"
			/>
			<!-- Keep the controller mounted so persisted nodes remain editable when insertion is hidden. -->
			<ComponentInsertMenu
				v-model="componentInsertOpen"
				:editor="editor"
				:components="metadata.components.value"
				:loading="metadata.state.value === 'loading'"
				:disabled="disabled"
				:insertion-enabled="isEditorToolEnabled(enabledTools, 'component')"
			/>
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

.markdown-editor.is-fullscreen {
	position: fixed;
	inset: 0;
	z-index: 490;
	display: flex;
	flex-direction: column;
	border-radius: 0;
}

.markdown-editor.is-fullscreen .markdown-editor__canvas {
	flex: 1;
	min-block-size: 0;
	overflow: auto;
}

.markdown-editor__canvas {
	min-height: 12rem;
	padding-block: 1rem;
	padding-inline: 3rem;
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

:deep(.ProseMirror .code-block__pre) {
	margin-block: 0;
	border-radius: 0;
}

:deep(.ProseMirror .tableWrapper) {
	margin-block: 1.5rem;
	overflow-x: auto;
}

:deep(.ProseMirror table) {
	width: 100%;
	border-collapse: collapse;
	table-layout: fixed;
}

:deep(.ProseMirror th),
:deep(.ProseMirror td) {
	position: relative;
	min-width: 5rem;
	padding: 0.5rem 0.625rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	vertical-align: top;
}

:deep(.ProseMirror th) {
	background: var(--theme--background-subdued, #f0f2f5);
	font-weight: 700;
}

:deep(.ProseMirror .selectedCell::after) {
	position: absolute;
	inset: 0;
	z-index: 1;
	background: color-mix(in srgb, var(--theme--primary, #6644ff) 14%, transparent);
	pointer-events: none;
	content: '';
}

:deep(.ProseMirror .column-resize-handle) {
	position: absolute;
	top: -1px;
	right: -2px;
	bottom: -1px;
	z-index: 2;
	width: 4px;
	background: var(--theme--primary, #6644ff);
	pointer-events: none;
}

:deep(.ProseMirror.resize-cursor) {
	cursor: col-resize;
}

:deep(.ProseMirror pre.shiki),
:deep(.ProseMirror .code-block.shiki .code-block__pre) {
	color: #24292e !important;
	background: #fff !important;
}

.markdown-editor.is-dark :deep(.ProseMirror pre.shiki),
.markdown-editor.is-dark :deep(.ProseMirror pre.shiki code span),
.markdown-editor.is-dark :deep(.ProseMirror .code-block.shiki .code-block__pre),
.markdown-editor.is-dark :deep(.ProseMirror .code-block.shiki .code-block__pre code span) {
	color: var(--shiki-dark, #e1e4e8) !important;
	background-color: var(--shiki-dark-bg, #24292e) !important;
	font-style: var(--shiki-dark-font-style) !important;
	font-weight: var(--shiki-dark-font-weight) !important;
	text-decoration: var(--shiki-dark-text-decoration) !important;
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
