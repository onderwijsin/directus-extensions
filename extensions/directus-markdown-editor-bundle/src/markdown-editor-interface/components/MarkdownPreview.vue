<script setup lang="ts">
import type { ComponentMetadata } from '../component-meta/schema'

import { watch } from 'vue'

import { EditorContent, useEditor } from '@tiptap/vue-3'

import '../editor/content.css'
import { createEditorExtensions } from '../editor/extensions'
import { synchronizeEditorMarkdown } from '../editor/synchronization'

const props = defineProps<{
	content: string
	components?: ComponentMetadata[]
	label: string
}>()

const editor = useEditor({
	content: props.content,
	contentType: 'markdown',
	editable: false,
	extensions: createEditorExtensions(() => props.components ?? []),
	editorProps: { attributes: { 'aria-label': props.label } },
})

watch(
	() => props.content,
	(content) => {
		if (editor.value) synchronizeEditorMarkdown(editor.value, content)
	},
)
</script>

<template>
	<EditorContent
		v-if="editor"
		class="markdown-preview markdown-editor-content"
		:editor="editor"
	/>
</template>

<style scoped>
.markdown-preview :deep(.ProseMirror > :first-child) {
	margin-block-start: 0;
}

.markdown-preview :deep(.ProseMirror > :last-child) {
	margin-block-end: 0;
}
</style>
