<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
// oxlint-disable jsdoc/require-param, jsdoc/require-returns
import { ref, watch } from 'vue'

import { EditorContent, useEditor } from '@tiptap/vue-3'

import { createEditorExtensions } from './editor/extensions'

const props = defineProps<{
	value?: string | null
	disabled?: boolean
	options?: { metadataUrl?: string | null; useMockMetadata?: boolean }
}>()
const emit = defineEmits<{ input: [value: string] }>()
const syncing = ref(false)

const editor = useEditor({
	content: props.value ?? '',
	extensions: createEditorExtensions(),
	contentType: 'markdown',
	/**
	 *
	 */
	onCreate: ({ editor: instance }) => instance.setEditable(!props.disabled),
	/**
	 *
	 */
	onUpdate: ({ editor: instance }) => {
		if (!syncing.value) emit('input', instance.getMarkdown())
	},
})

watch(
	() => props.disabled,
	(disabled) => editor.value?.setEditable(!disabled),
)
watch(
	() => props.value,
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
		<EditorContent :editor="editor" />
	</div>
</template>
