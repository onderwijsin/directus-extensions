<script setup lang="ts">
import { ref } from 'vue'

import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'

import DirectusIcon from '../ui/DirectusIcon.vue'
import DirectusMenu from '../ui/DirectusMenu.vue'
import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
const menuOpen = ref(false)

/**
 * Select the component node in the editor.
 * @returns Whether the node was selected.
 */
function selectComponent() {
	const position = props.getPos()
	if (position === undefined) return false
	return props.editor.chain().focus().setNodeSelection(position).run()
}

/**
 * Open the component settings drawer from the node view.
 * @returns Nothing.
 */
function editComponent() {
	if (!selectComponent()) return
	menuOpen.value = false
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-edit-component', {
			bubbles: true,
			detail: { name: props.node.attrs.name },
		}),
	)
}

/**
 * Delete the component node and its slot content.
 * @returns Nothing.
 */
function deleteComponent() {
	if (!selectComponent()) return
	props.editor.chain().deleteSelection().run()
	menuOpen.value = false
}
</script>

<template>
	<NodeViewWrapper class="mdc-block-view" data-mdc-node-view>
		<div class="mdc-block-view__header">
			<span class="mdc-block-view__label">{{ props.node.attrs.name }}</span>
			<DirectusMenu v-model="menuOpen" placement="bottom-end">
				<template #activator>
					<button
						type="button"
						class="mdc-block-view__settings"
						aria-label="Component actions"
						title="Component actions"
						@mousedown.stop.prevent
						@click.stop="menuOpen = !menuOpen"
					>
						<DirectusIcon name="more_horiz" />
					</button>
				</template>
				<div class="mdc-block-view__menu">
					<button type="button" @mousedown.stop.prevent @click.stop="editComponent">
						<DirectusIcon name="settings" />
						<span>Settings</span>
					</button>
					<button
						type="button"
						class="is-danger"
						@mousedown.stop.prevent
						@click.stop="deleteComponent"
					>
						<DirectusIcon name="delete" />
						<span>Delete</span>
					</button>
				</div>
			</DirectusMenu>
		</div>
		<NodeViewContent class="mdc-block-view__content" />
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-block-view {
	margin-block: 0.75rem;
	padding: 0.625rem;
	border: 1px dashed var(--theme--primary, #6644ff);
	border-radius: 0.375rem;
	background: color-mix(in srgb, var(--theme--primary, #6644ff) 5%, transparent);
}

.mdc-block-view__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-block-end: 0.5rem;
	font-size: 0.75rem;
	color: var(--theme--foreground-subdued, #8b98a5);
}

.mdc-block-view__label {
	font-weight: 600;
}

.mdc-block-view__settings {
	display: grid;
	place-items: center;
	width: 1.75rem;
	height: 1.75rem;
	padding: 0;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.mdc-block-view__settings:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}

.mdc-block-view__menu {
	display: grid;
	min-width: 8rem;
	padding: 0.25rem;
}

.mdc-block-view__menu button {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	color: var(--theme--foreground, #1f2937);
	text-align: start;
	cursor: pointer;
}

.mdc-block-view__menu button:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}

.mdc-block-view__menu button.is-danger {
	color: var(--theme--danger, #cc3a3a);
}

.mdc-block-view__content {
	min-height: 1.5rem;
}
</style>
