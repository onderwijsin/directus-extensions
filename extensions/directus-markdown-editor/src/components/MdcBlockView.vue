<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue NodeView callbacks are private component behavior. */
import { computed, shallowRef, watch } from 'vue'

import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'

import { useEditorEditable } from '../composables/useEditorEditable'
import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
const editable = useEditorEditable(props.editor)
const menuOpen = shallowRef(false)
const componentName = computed(() =>
	typeof props.node.attrs.name === 'string' ? props.node.attrs.name : 'Unknown component',
)
const componentProps = computed(() => {
	const value = props.node.attrs.props
	return value && typeof value === 'object' ? Object.entries(value) : []
})
watch(editable, (value) => {
	if (!value) menuOpen.value = false
})

function selectComponent() {
	if (!editable.value) return false
	if (typeof props.getPos !== 'function') return false
	const position = props.getPos()
	if (typeof position !== 'number') return false
	return props.editor.chain().focus().setNodeSelection(position).run()
}

function editComponent() {
	if (!selectComponent()) return
	menuOpen.value = false
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-edit-component', {
			bubbles: true,
			detail: {
				name: componentName.value,
				props: props.node.attrs.props,
				nodeType: 'mdcBlock',
			},
		}),
	)
}

function duplicateComponent() {
	if (!editable.value) return
	if (typeof props.getPos !== 'function') return
	const position = props.getPos()
	if (typeof position !== 'number') return
	props.editor
		.chain()
		.focus()
		.insertContentAt(position + props.node.nodeSize, props.node.toJSON())
		.run()
	menuOpen.value = false
}

function deleteComponent() {
	if (!editable.value) return
	if (!selectComponent()) return
	props.editor.chain().deleteSelection().run()
	menuOpen.value = false
}
</script>

<template>
	<NodeViewWrapper class="mdc-block" data-mdc-node-view>
		<header class="mdc-block__header" contenteditable="false">
			<div class="mdc-block__identity">
				<span class="mdc-block__icon"><VIcon name="widgets" /></span>
				<strong>{{ componentName }}</strong>
			</div>
			<div class="mdc-block__summary">
				<VMenu v-model="menuOpen" placement="bottom-end" show-arrow>
					<template #activator>
						<VButton
							icon
							small
							ghost
							:disabled="!editable"
							aria-label="Component actions"
							title="Component actions"
							@mousedown.stop.prevent
							@click.stop="menuOpen = !menuOpen"
							><VIcon name="more_horiz"
						/></VButton>
					</template>
					<VList class="mdc-block__menu">
						<VListItem clickable @click="editComponent"
							><VListItemIcon><VIcon name="tune" /></VListItemIcon
							><VListItemContent>Settings</VListItemContent></VListItem
						>
						<VListItem clickable @click="duplicateComponent"
							><VListItemIcon><VIcon name="content_copy" /></VListItemIcon
							><VListItemContent>Duplicate</VListItemContent></VListItem
						>
						<VDivider />
						<VListItem clickable class="mdc-block__danger" @click="deleteComponent"
							><VListItemIcon><VIcon name="delete" /></VListItemIcon
							><VListItemContent>Delete</VListItemContent></VListItem
						>
					</VList>
				</VMenu>
			</div>
		</header>
		<div v-if="componentProps.length" class="mdc-block__props" contenteditable="false">
			<code v-for="[name, value] in componentProps" :key="name"
				>{{ name }}={{ JSON.stringify(value) }}</code
			>
		</div>
		<NodeViewContent class="mdc-block__content" />
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-block {
	margin-block: 1rem;
	border: 1px solid
		color-mix(in srgb, var(--theme--primary, #6644ff) 35%, var(--theme--border-color, #d3dce3));
	border-radius: calc(var(--theme--border-radius, 0.25rem) * 1.5);
	background: color-mix(
		in srgb,
		var(--theme--primary, #6644ff) 3%,
		var(--theme--background, white)
	);
	overflow: clip;
}

.mdc-block.ProseMirror-selectednode {
	border-color: var(--theme--primary, #6644ff);
	box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme--primary, #6644ff) 16%, transparent);
}
.mdc-block__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.625rem 0.75rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #edf0f2);
	background: color-mix(
		in srgb,
		var(--theme--primary, #6644ff) 6%,
		var(--theme--background, white)
	);
}
.mdc-block__identity,
.mdc-block__summary {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}
.mdc-block__identity strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.mdc-block__icon {
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--primary, #6644ff);
	color: var(--theme--primary-foreground, white) !important;
}
.mdc-block__props {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	padding: 0.5rem 0.75rem 0;
}
.mdc-block__props code {
	padding: 0.125rem 0.375rem;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background-normal, #f0f2f5);
	color: var(--theme--foreground-subdued, #64748b);
	font-size: 0.6875rem;
}
.mdc-block__content {
	min-height: 2.5rem;
	padding: 0.25rem 0.75rem 0.75rem;
}
.mdc-block__menu {
	min-width: 11rem;
}
.mdc-block__danger {
	color: var(--theme--danger, #cc3a3a);
}
</style>
