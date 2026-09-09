<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue NodeView callbacks are private component behavior. */
import type { ReferenceIntegrityState } from '../reference/editor'

import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import { NodeViewWrapper } from '@tiptap/vue-3'

import { useEditorEditable } from '../composables/useEditorEditable'
import { parseReferenceProps } from '../reference/schema'
import { getEditorReferenceState } from '../reference/status'
import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
const editable = useEditorEditable(props.editor)
const referenceProblemState = shallowRef<ReferenceIntegrityState>()

function setReferenceProblemState(value: unknown) {
	referenceProblemState.value =
		value === 'archived' || value === 'not_available' ? value : undefined
}

function updateReferenceIntegrity(event: Event) {
	if (!(event instanceof CustomEvent) || !(event.detail instanceof Map)) return
	if (typeof props.getPos !== 'function') return
	const position = props.getPos()
	if (typeof position !== 'number') return
	setReferenceProblemState(event.detail.get(position))
}

onMounted(() => {
	if (typeof props.getPos === 'function') {
		const position = props.getPos()
		if (typeof position === 'number') {
			setReferenceProblemState(getEditorReferenceState(props.editor, position))
		}
	}
	props.editor.view.dom.addEventListener(
		'markdown-editor-reference-integrity',
		updateReferenceIntegrity,
	)
})
onBeforeUnmount(() =>
	props.editor.view.dom.removeEventListener(
		'markdown-editor-reference-integrity',
		updateReferenceIntegrity,
	),
)

function editComponent() {
	if (!editable.value) return
	if (typeof props.getPos !== 'function') return
	const position = props.getPos()
	if (typeof position !== 'number') return
	if (!props.editor.chain().focus().setNodeSelection(position).run()) return
	const reference = props.node.attrs.name === 'Reference'
	props.editor.view.dom.dispatchEvent(
		new CustomEvent(
			reference ? 'markdown-editor-edit-reference' : 'markdown-editor-edit-component',
			{
				bubbles: true,
				detail: {
					name: props.node.attrs.name,
					props: props.node.attrs.props,
					nodeType: 'mdcInline',
					position,
				},
			},
		),
	)
}

const reference = computed(() =>
	props.node.attrs.name === 'Reference' ? parseReferenceProps(props.node.attrs.props) : undefined,
)
</script>

<template>
	<NodeViewWrapper as="span" class="mdc-inline" data-mdc-node-view contenteditable="false">
		<button
			type="button"
			class="mdc-inline__button"
			:class="{
				'mdc-inline__button--reference': reference?.success,
				'mdc-inline__button--invalid': reference && !reference.success,
				'mdc-inline__button--archived': referenceProblemState === 'archived',
				'mdc-inline__button--unavailable': referenceProblemState === 'not_available',
			}"
			:disabled="!editable"
			:aria-label="
				props.node.attrs.name === 'Reference'
					? 'Edit reference'
					: `Configure ${props.node.attrs.name} component`
			"
			:title="
				referenceProblemState === 'archived'
					? 'Referenced item is archived'
					: referenceProblemState === 'not_available'
						? 'Referenced item is unavailable'
						: reference?.success
							? `${reference.data.collection} · ${reference.data.item}`
							: undefined
			"
			@click="editComponent"
		>
			<VIcon
				:name="
					reference?.success
						? referenceProblemState === 'archived'
							? 'archive'
							: referenceProblemState === 'not_available'
								? 'error'
								: reference.data.icon || 'alternate_email'
						: reference
							? 'warning'
							: 'widgets'
				"
				small
			/>
			<span v-if="reference?.success">{{ reference.data.text || reference.data.label }}</span>
			<span v-else-if="reference">Invalid reference</span>
			<span v-else>{{ props.node.attrs.name }}</span>
		</button>
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-inline {
	display: inline-flex;
	vertical-align: middle;
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
.mdc-inline__button--invalid {
	border-color: var(--theme--warning, #f2c94c);
	background: color-mix(in srgb, var(--theme--warning, #f2c94c) 12%, transparent);
	color: var(--theme--warning-foreground, #7a5b00);
}
.mdc-inline__button--archived {
	border-color: var(--theme--warning, #f2c94c);
	background: color-mix(in srgb, var(--theme--warning, #f2c94c) 12%, transparent);
	color: var(--theme--warning-foreground, #7a5b00);
}
.mdc-inline__button--unavailable {
	border-color: var(--theme--danger, #cc3a3a);
	background: color-mix(in srgb, var(--theme--danger, #cc3a3a) 12%, transparent);
	color: var(--theme--danger, #cc3a3a);
}
.mdc-inline__button:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}
</style>
