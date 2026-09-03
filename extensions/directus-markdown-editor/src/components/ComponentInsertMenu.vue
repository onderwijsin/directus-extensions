<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

// Component selection is metadata-driven; it never creates dynamic Tiptap extensions.
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import DirectusButton from '../ui/DirectusButton.vue'
import DirectusIcon from '../ui/DirectusIcon.vue'
import DirectusInput from '../ui/DirectusInput.vue'
import DirectusMenu from '../ui/DirectusMenu.vue'
import ComponentPropsDrawer from './ComponentPropsDrawer.vue'

const props = defineProps<{
	editor: Editor
	components: ComponentMetadata[]
	loading?: boolean
	disabled?: boolean
}>()
const query = shallowRef('')
const selected = shallowRef<ComponentMetadata | null>(null)
const drawerOpen = shallowRef(false)
const editExisting = shallowRef(false)
const revision = shallowRef(0)
const menuOpen = shallowRef(false)
interface SelectedBlockNode {
	type: { name: string }
	attrs: { name?: unknown; props?: Record<string, unknown> }
}

/**
 * Editor callback.
 * @param value Parameter value.
 * @returns Callback result.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Editor callback.
 * @param node Parameter value.
 * @returns Callback result.
 */
function isSelectedBlockNode(node: unknown): node is SelectedBlockNode {
	if (!node || typeof node !== 'object' || !('type' in node) || !('attrs' in node)) return false
	const type = node.type
	const attrs = node.attrs
	return (
		type !== null &&
		type !== undefined &&
		type instanceof Object &&
		'name' in type &&
		type.name === 'mdcBlock' &&
		attrs !== null &&
		attrs !== undefined &&
		attrs instanceof Object &&
		(!('props' in attrs) || isRecord(attrs.props))
	)
}
const filteredComponents = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		const needle = query.value.trim().toLowerCase()
		return props.components.filter(
			/**
			 * Editor callback.
			 * @param component Parameter value.
			 * @returns Callback result.
			 */
			(component) =>
				`${component.name} ${component.label} ${component.description ?? ''}`
					.toLowerCase()
					.includes(needle),
		)
	},
)

/**
 * Editor callback.
 * @param component Parameter value.
 * @returns Callback result.
 */
function choose(component: ComponentMetadata) {
	editExisting.value = false
	selected.value = component
	drawerOpen.value = true
}
const selectedBlock = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		void revision.value
		const selection = props.editor.state.selection
		if (!('node' in selection)) return null
		const node = selection.node
		if (!isSelectedBlockNode(node)) return null
		return (
			props.components.find(
				/**
				 * Editor callback.
				 * @param component Parameter value.
				 * @returns Callback result.
				 */
				(component) => component.name === node.attrs.name,
			) ?? null
		)
	},
)
const selectedBlockProps = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		void revision.value
		const selection = props.editor.state.selection
		if (!('node' in selection)) return undefined
		const node = selection.node
		return isSelectedBlockNode(node) ? node.attrs.props : undefined
	},
)

/**
 * Editor callback.
 * @returns Callback result.
 */
function editSelected() {
	if (!selectedBlock.value) return
	selected.value = selectedBlock.value
	editExisting.value = true
	drawerOpen.value = true
}

/**
 * Open the settings drawer for a component node-view action.
 * @param event The node-view edit event.
 * @returns Nothing.
 */
function editComponentFromNodeView(event: Event) {
	if (!(event instanceof CustomEvent)) return
	const name = event.detail?.name
	if (typeof name !== 'string') return
	const component = props.components.find((candidate) => candidate.name === name)
	if (!component) return
	selected.value = component
	editExisting.value = true
	drawerOpen.value = true
}
const refresh =
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => (revision.value += 1)
onMounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.editor.on('transaction', refresh),
)
onMounted(() =>
	props.editor.view.dom.addEventListener(
		'markdown-editor-edit-component',
		editComponentFromNodeView,
	),
)
onBeforeUnmount(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.editor.off('transaction', refresh),
)
onBeforeUnmount(() =>
	props.editor.view.dom.removeEventListener(
		'markdown-editor-edit-component',
		editComponentFromNodeView,
	),
)
</script>

<template>
	<div class="component-insert-menu">
		<div class="component-insert-menu__toolbar-group">
			<div class="component-insert-menu__separator" aria-hidden="true" />
			<DirectusMenu v-model="menuOpen">
				<template #activator>
					<DirectusButton
						class="component-insert-menu__button"
						:disabled="disabled || loading"
						tooltip="Insert component"
						aria-label="Insert component"
						@click.stop="menuOpen = !menuOpen"
					>
						<template #icon><DirectusIcon name="widgets" /></template>
					</DirectusButton>
				</template>
				<div class="component-insert-menu__content">
					<DirectusInput
						v-model="query"
						label="Find component"
						placeholder="Search components…"
					/>
					<button
						v-for="component in filteredComponents"
						:key="component.name"
						type="button"
						class="component-insert-menu__item"
						@click="choose(component)"
					>
						<strong>{{ component.label }}</strong>
						<small>{{ component.description }}</small>
					</button>
					<div v-if="!filteredComponents.length" class="component-insert-menu__empty">
						No components
					</div>
				</div>
			</DirectusMenu>
		</div>
		<DirectusButton
			v-if="selectedBlock"
			:key="revision"
			label="Edit component"
			:disabled="disabled"
			tooltip="Edit component properties"
			@click="editSelected"
		/>
		<ComponentPropsDrawer
			v-model:open="drawerOpen"
			:editor="editor"
			:component="selected"
			:disabled="disabled"
			:edit-existing="editExisting"
			:initial-props="selectedBlockProps"
		/>
	</div>
</template>

<style scoped>
.component-insert-menu__content {
	display: grid;
	min-width: 16rem;
	gap: 0.25rem;
	padding: 0.5rem;
}
.component-insert-menu__toolbar-group {
	display: flex;
	align-items: center;
	gap: 0.125rem;
}
.component-insert-menu__separator {
	block-size: 1.25rem;
	margin-inline: 0.125rem;
	border-inline-end: 1px solid var(--theme--border-color, #d3dce3);
}
.component-insert-menu__button {
	margin-inline-end: 0;
}
.component-insert-menu__item {
	display: grid;
	gap: 0.125rem;
	padding: 0.5rem;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	text-align: start;
	cursor: pointer;
}
.component-insert-menu__item:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}
.component-insert-menu__item small,
.component-insert-menu__empty {
	color: var(--theme--foreground-subdued, #8b98a5);
}
</style>
