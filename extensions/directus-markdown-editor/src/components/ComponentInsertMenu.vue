<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import ComponentPropsDrawer from './ComponentPropsDrawer.vue'

const props = defineProps<{
	editor: Editor
	components: ComponentMetadata[]
	loading?: boolean
	disabled?: boolean
}>()
const open = defineModel<boolean>({ default: false })
const query = shallowRef('')
const selected = shallowRef<ComponentMetadata | null>(null)
const propsDrawerOpen = shallowRef(false)
const editExisting = shallowRef(false)
const initialProps = shallowRef<Record<string, unknown> | undefined>()
const targetNodeType = shallowRef<'mdcBlock' | 'mdcInline'>('mdcBlock')

const filteredComponents = computed(() => {
	const terms = query.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
	if (terms.length === 0) return props.components
	return props.components.filter((component) => {
		const haystack =
			`${component.name} ${component.label} ${component.description ?? ''}`.toLocaleLowerCase()
		return terms.every((term) => haystack.includes(term))
	})
})

function choose(component: ComponentMetadata) {
	if (props.disabled || !props.editor.isEditable) return
	selected.value = component
	initialProps.value = undefined
	editExisting.value = false
	targetNodeType.value = component.slots.length === 0 ? 'mdcInline' : 'mdcBlock'
	open.value = false
	propsDrawerOpen.value = true
}

function editComponentFromNodeView(event: Event) {
	if (props.disabled || !props.editor.isEditable) return
	if (!(event instanceof CustomEvent) || typeof event.detail?.name !== 'string') return
	const known = props.components.find((candidate) => candidate.name === event.detail.name)
	const rawProps =
		event.detail.props && typeof event.detail.props === 'object' ? event.detail.props : {}
	const component = known ?? {
		name: event.detail.name,
		label: event.detail.name,
		description:
			'This component is not present in the configured metadata. Existing properties are preserved.',
		props: Object.fromEntries(
			Object.keys(rawProps).map((name) => [name, { name, type: 'string' }]),
		),
		slots: [],
	}
	selected.value = component
	initialProps.value = rawProps
	targetNodeType.value = event.detail.nodeType === 'mdcInline' ? 'mdcInline' : 'mdcBlock'
	editExisting.value = true
	propsDrawerOpen.value = true
}

let editorDom: HTMLElement | undefined
onMounted(() => {
	editorDom = props.editor.view.dom
	editorDom.addEventListener('markdown-editor-edit-component', editComponentFromNodeView)
})
onBeforeUnmount(() =>
	editorDom?.removeEventListener('markdown-editor-edit-component', editComponentFromNodeView),
)

watch(
	() => props.disabled,
	/**
	 * Close component authoring UI when Directus locks the interface.
	 * @param disabled Whether the interface is locked.
	 * @returns Nothing.
	 */
	(disabled) => {
		if (!disabled) return
		open.value = false
		propsDrawerOpen.value = false
	},
)
</script>

<template>
	<VDialog v-model="open" persistent>
		<VCard class="component-picker" role="dialog" aria-label="Insert component">
			<VCardTitle>Insert component</VCardTitle>
			<VCardText class="component-picker__body">
				<div class="component-picker__search">
					<VInput
						v-model="query"
						autofocus
						placeholder="Search components…"
						aria-label="Search components"
						:disabled="disabled"
						><template #prepend><VIcon name="search" /></template
					></VInput>
				</div>

				<VProgressCircular v-if="loading" indeterminate class="component-picker__loading" />
				<VNotice v-else-if="components.length === 0" type="info"
					>No component metadata is available.</VNotice
				>
				<VNotice v-else-if="filteredComponents.length === 0" type="info"
					>No components match “{{ query }}”.</VNotice
				>
				<VList v-else class="component-picker__list">
					<VListItem
						v-for="component in filteredComponents"
						:key="component.name"
						clickable
						:disabled="disabled"
						@click="choose(component)"
					>
						<VListItemContent style="padding: 0.5rem 0">
							<div class="component-picker__label">{{ component.label }}</div>
							<div v-if="component.description" class="component-picker__description">
								{{ component.description }}
							</div>
						</VListItemContent>
					</VListItem>
				</VList>
			</VCardText>
			<VCardActions><VButton secondary @click="open = false">Cancel</VButton></VCardActions>
		</VCard>
	</VDialog>

	<ComponentPropsDrawer
		v-model:open="propsDrawerOpen"
		:editor="editor"
		:component="selected"
		:disabled="disabled"
		:edit-existing="editExisting"
		:initial-props="initialProps"
		:target-node-type="targetNodeType"
	/>
</template>

<style scoped>
.component-picker {
	width: min(38rem, calc(100vw - 2rem));
}
.component-picker__body {
	gap: 1rem;
	min-height: 18rem;
}
.component-picker__search {
	margin-bottom: 1rem;
}
.component-picker__loading {
	place-self: center;
}
.component-picker__list {
	max-height: 22rem;
	overflow-y: auto;
}
.component-picker__label {
	font-weight: 600;
}
.component-picker__description {
	margin-block-start: 0.125rem;
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
</style>
