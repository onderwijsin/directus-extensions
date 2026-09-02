<script setup lang="ts">
import type { ComponentMetadata } from './component-meta/schema'

// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
// oxlint-disable jsdoc/require-param, jsdoc/require-returns
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { isNodeSelection } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/vue-3'

import { loadComponentMetadata } from './component-meta/loader'
import MarkdownSourcePanel from './components/MarkdownSourcePanel.vue'
import MdcInsertMenu, { type MdcInsertRequest } from './components/MdcInsertMenu.vue'
import { createEditorExtensions } from './editor/extensions'

const props = defineProps<{
	value?: string | null
	disabled?: boolean
	options?: { metadataUrl?: string | null }
}>()
const emit = defineEmits<{ input: [value: string] }>()
const syncing = ref(false)
const components = ref<ComponentMetadata[]>([])
const metadataError = ref<string | undefined>()
const sourceMode = ref(false)
const sourceRequired = ref(false)
const sourceText = ref(props.value ?? '')
const selectionVersion = ref(0)
let metadataController: AbortController | undefined

const editor = useEditor({
	content: props.value ?? '',
	extensions: createEditorExtensions(),
	contentType: 'markdown',
	// Keep the initial editor state aligned with Directus without emitting a field update.
	/**
	 *
	 */
	onCreate: ({ editor: instance }) => {
		instance.setEditable(!props.disabled)
		if (props.value && instance.getMarkdown() !== props.value) {
			sourceRequired.value = true
			sourceMode.value = true
		}
	},
	// The syncing guard prevents external Directus updates from becoming phantom edits.
	/**
	 *
	 */
	onUpdate: ({ editor: instance }) => {
		if (!syncing.value) {
			sourceText.value = instance.getMarkdown()
			if (!sourceMode.value) emit('input', instance.getMarkdown())
		}
	},
	/**
	 *
	 */
	onSelectionUpdate: () => selectionVersion.value++,
})

watch(
	() => props.disabled,
	(disabled) => editor.value?.setEditable(!disabled),
)
watch(
	() => props.value,
	(value) => {
		sourceText.value = value ?? ''
		const instance = editor.value
		if (!instance || value === instance.getMarkdown()) return
		syncing.value = true
		instance.commands.setContent(value ?? '', { contentType: 'markdown', emitUpdate: false })
		syncing.value = false
	},
)
watch(
	() => props.options?.metadataUrl,
	async (url) => {
		metadataController?.abort()
		components.value = []
		metadataError.value = undefined
		if (!url?.trim()) return
		metadataController = new AbortController()
		try {
			components.value = await loadComponentMetadata(url.trim(), metadataController.signal)
		} catch (error) {
			if (metadataController.signal.aborted) return
			metadataError.value =
				error instanceof Error ? error.message : 'Component metadata could not be loaded.'
		}
	},
	{ immediate: true },
)
onBeforeUnmount(() => metadataController?.abort())

const canUndo = computed(() => editor.value?.can().undo() ?? false)
const canRedo = computed(() => editor.value?.can().redo() ?? false)
const selectedMdcBlock = computed(() => {
	void selectionVersion.value
	const selection = editor.value?.state.selection
	const node = selection && isNodeSelection(selection) ? selection.node : undefined
	return node?.type.name === 'mdcBlock' ? node : undefined
})

/** Toggle one of the marks exposed by the compact formatting toolbar. */
function toggleMark(mark: 'bold' | 'italic' | 'strike') {
	const instance = editor.value
	if (!instance) return
	if (mark === 'bold') instance.chain().focus().toggleBold().run()
	if (mark === 'italic') instance.chain().focus().toggleItalic().run()
	if (mark === 'strike') instance.chain().focus().toggleStrike().run()
}

/** Insert a generic MDC node using the same model as the future metadata menu. */
function insertMdc(request: MdcInsertRequest) {
	const instance = editor.value
	if (!instance) return
	const node =
		request.type === 'block'
			? {
					type: 'mdcBlock',
					attrs: {
						name: request.name,
						props: request.props,
						depth: 2,
						propsFormat: 'inline',
					},
					content: [{ type: 'paragraph' }],
				}
			: { type: 'mdcInline', attrs: { name: request.name, props: request.props } }
	instance.chain().focus().insertContent(node).run()
}

/** Duplicate the currently selected generic MDC block. */
function duplicateSelectedBlock() {
	const instance = editor.value
	const selection = instance?.state.selection
	const node = selection && isNodeSelection(selection) ? selection.node : undefined
	if (!instance || !node || node.type.name !== 'mdcBlock' || !selection) return
	instance.chain().focus().insertContentAt(selection.to, node.toJSON()).run()
}

/** Delete the currently selected generic MDC block. */
function deleteSelectedBlock() {
	const instance = editor.value
	const selection = instance?.state.selection
	const node = selection && isNodeSelection(selection) ? selection.node : undefined
	if (!instance || !node || node.type.name !== 'mdcBlock' || !selection) return
	instance.chain().focus().deleteRange({ from: selection.from, to: selection.to }).run()
}

/** Open source mode explicitly, or keep it mandatory for unsupported content. */
function openSourceMode() {
	sourceText.value = sourceMode.value ? sourceText.value : (editor.value?.getMarkdown() ?? '')
	sourceMode.value = true
}

/**
 *
 */
function applySource() {
	const instance = editor.value
	if (!instance) return
	instance.commands.setContent(sourceText.value, { contentType: 'markdown', emitUpdate: false })
	sourceRequired.value = false
	sourceMode.value = false
	emit('input', sourceText.value)
}
</script>

<template>
	<div class="markdown-editor" :class="{ 'is-disabled': disabled }">
		<div class="markdown-editor__toolbar" role="toolbar" aria-label="Markdown formatting">
			<button type="button" :disabled="disabled" @click="toggleMark('bold')">
				<strong>B</strong>
			</button>
			<button type="button" :disabled="disabled" @click="toggleMark('italic')">
				<em>I</em>
			</button>
			<button type="button" :disabled="disabled" @click="toggleMark('strike')">
				<s>S</s>
			</button>
			<MdcInsertMenu :disabled="disabled" :components="components" @insert="insertMdc" />
			<button
				type="button"
				:disabled="disabled || !selectedMdcBlock"
				@click="duplicateSelectedBlock"
			>
				Duplicate block
			</button>
			<button
				type="button"
				:disabled="disabled || !selectedMdcBlock"
				@click="deleteSelectedBlock"
			>
				Delete block
			</button>
			<span
				v-if="metadataError"
				class="markdown-editor__metadata-error"
				:title="metadataError"
			>
				Metadata unavailable
			</span>
			<span class="markdown-editor__separator" />
			<button
				type="button"
				:disabled="!canUndo || disabled"
				@click="editor?.chain().focus().undo().run()"
			>
				Undo
			</button>
			<button
				type="button"
				:disabled="!canRedo || disabled"
				@click="editor?.chain().focus().redo().run()"
			>
				Redo
			</button>
			<button type="button" :disabled="disabled || sourceRequired" @click="openSourceMode">
				Source
			</button>
		</div>
		<MarkdownSourcePanel
			v-if="sourceMode"
			v-model="sourceText"
			:disabled="disabled"
			:required="sourceRequired"
			@apply="applySource"
			@cancel="sourceMode = false"
		/>
		<EditorContent v-else :editor="editor" />
	</div>
</template>

<style scoped>
.markdown-editor {
	border: 1px solid var(--theme--form--field--input--border-color, #c8d0d9);
	border-radius: 4px;
	overflow: hidden;
	background: var(--theme--form--field--input--background, #fff);
}
.markdown-editor__toolbar {
	display: flex;
	gap: 0.25rem;
	padding: 0.5rem;
	border-bottom: 1px solid var(--theme--form--field--input--border-color, #c8d0d9);
}
.markdown-editor__toolbar button {
	border: 0;
	background: transparent;
	padding: 0.35rem 0.5rem;
	border-radius: 3px;
	cursor: pointer;
	color: inherit;
}
.markdown-editor__toolbar button:hover:not(:disabled) {
	background: var(--theme--background-subdued, #eef1f4);
}
.markdown-editor__toolbar button:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.markdown-editor__separator {
	flex: 1;
}
.markdown-editor__metadata-error {
	align-self: center;
	font-size: 0.75rem;
	color: var(--theme--danger, #d02f2f);
}
.markdown-editor :deep(.ProseMirror) {
	min-height: 12rem;
	padding: 1rem;
	outline: none;
}
.markdown-editor :deep(.ProseMirror p) {
	margin: 0 0 0.75rem;
}
.markdown-editor :deep([data-mdc-block]) {
	border: 1px dashed var(--theme--primary, #6644ff);
	padding: 0.75rem;
	margin: 0.75rem 0;
}
.markdown-editor :deep([data-mdc-block])::before {
	display: block;
	margin-bottom: 0.5rem;
	font-size: 0.75rem;
	font-weight: 600;
	content: 'MDC: ' attr(data-mdc-block);
	color: var(--theme--primary, #6644ff);
}
.is-disabled {
	opacity: 0.7;
}
</style>
