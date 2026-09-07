<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue NodeView callbacks are private component behavior. */
import { NodeViewWrapper } from '@tiptap/vue-3'

import { useEditorEditable } from '../composables/useEditorEditable'
import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
const editable = useEditorEditable(props.editor)

function editComponent() {
	if (!editable.value) return
	if (typeof props.getPos !== 'function') return
	const position = props.getPos()
	if (typeof position !== 'number') return
	if (!props.editor.chain().focus().setNodeSelection(position).run()) return
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-edit-component', {
			bubbles: true,
			detail: {
				name: props.node.attrs.name,
				props: props.node.attrs.props,
				nodeType: 'mdcInline',
			},
		}),
	)
}
</script>

<template>
	<NodeViewWrapper as="span" class="mdc-inline" data-mdc-node-view contenteditable="false">
		<button
			type="button"
			class="mdc-inline__button"
			:disabled="!editable"
			:aria-label="`Configure ${props.node.attrs.name} component`"
			@click="editComponent"
		>
			<VIcon name="widgets" small />
			<span>{{ props.node.attrs.name }}</span>
			<VIcon name="tune" small class="mdc-inline__settings" />
		</button>
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-inline {
	display: inline-flex;
	vertical-align: baseline;
}
.mdc-inline__button {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.125rem 0.375rem;
	border: 1px solid color-mix(in srgb, var(--theme--primary, #6644ff) 45%, transparent);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: color-mix(in srgb, var(--theme--primary, #6644ff) 8%, transparent);
	color: var(--theme--primary, #6644ff);
	font: inherit;
	font-size: 0.8em;
	cursor: pointer;
}
.mdc-inline__button:hover,
.ProseMirror-selectednode .mdc-inline__button {
	background: color-mix(in srgb, var(--theme--primary, #6644ff) 14%, transparent);
}
.mdc-inline__button:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}
.mdc-inline__settings {
	opacity: 0;
	transition: opacity 120ms ease;
}
.mdc-inline__button:hover .mdc-inline__settings,
.mdc-inline__button:focus .mdc-inline__settings {
	opacity: 1;
}
</style>
