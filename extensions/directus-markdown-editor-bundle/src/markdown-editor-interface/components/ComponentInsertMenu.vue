<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { ComponentOccurrence } from '../component-meta/freshness'
import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import { fromEntries, isInteger, isRecord, isString } from '@onderwijsin/directus-extension-utils'
import { exitSuggestion } from '@tiptap/suggestion'

import { scanComponentIntegrity } from '../component-meta/freshness'
import { metadataDeprecation } from '../component-meta/schema'
import { setEditorComponentStates } from '../component-meta/status'
import { resolveComponentNodeType } from '../editor/insertion'
import ComponentPropsDrawer from './ComponentPropsDrawer.vue'
import ComponentPropsReport from './ComponentPropsReport.vue'

const props = withDefaults(
	defineProps<{
		editor: Editor
		components: ComponentMetadata[]
		loading?: boolean
		disabled?: boolean
		insertionEnabled?: boolean
		metadataAuthoritative?: boolean
	}>(),
	{
		insertionEnabled: true,
	},
)
const open = defineModel<boolean>({ default: false })
const reportOpen = defineModel<boolean>('reportOpen', { default: false })
const emit = defineEmits<{ attentionChange: [needsAttention: boolean] }>()
const query = shallowRef('')
const selected = shallowRef<ComponentMetadata | null>(null)
const propsDrawerOpen = shallowRef(false)
const editExisting = shallowRef(false)
const initialProps = shallowRef<Record<string, unknown> | undefined>()
const targetNodeType = shallowRef<'mdcBlock' | 'mdcInline'>('mdcBlock')
const targetPosition = shallowRef<number>()
const selectedOccurrence = shallowRef<ComponentOccurrence>()
const occurrences = shallowRef<ComponentOccurrence[]>([])

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
	if (!props.insertionEnabled || props.disabled || !props.editor.isEditable) return
	selected.value = component
	initialProps.value = undefined
	selectedOccurrence.value = undefined
	targetPosition.value = undefined
	editExisting.value = false
	targetNodeType.value = resolveComponentNodeType(component)
	open.value = false
	propsDrawerOpen.value = true
}

function editComponentFromNodeView(event: Event) {
	if (props.disabled || !props.editor.isEditable) return
	if (!(event instanceof CustomEvent) || !isString(event.detail?.name)) return
	exitSuggestion(props.editor.view)
	const known = props.components.find((candidate) => candidate.name === event.detail.name)
	const rawProps = isRecord(event.detail.props) ? event.detail.props : {}
	const position = isInteger(event.detail.position) ? event.detail.position : undefined
	selected.value =
		known ??
		(props.metadataAuthoritative
			? null
			: {
					name: event.detail.name,
					label: event.detail.name,
					nodeType: event.detail.nodeType === 'mdcInline' ? 'inline' : 'block',
					description: 'No authoritative component metadata is currently available.',
					props: fromEntries(
						Object.keys(rawProps).map((name) => [name, { name, type: 'string' }]),
					),
					slots: [],
				})
	initialProps.value = rawProps
	targetPosition.value = position
	selectedOccurrence.value = occurrences.value.find((entry) => entry.position === position)
	targetNodeType.value = event.detail.nodeType === 'mdcInline' ? 'mdcInline' : 'mdcBlock'
	editExisting.value = true
	propsDrawerOpen.value = true
}

function scan() {
	occurrences.value = props.metadataAuthoritative
		? scanComponentIntegrity(props.editor, props.components)
		: []
	const states = new Map(occurrences.value.map((entry) => [entry.position, entry.state]))
	setEditorComponentStates(props.editor, states)
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-component-integrity', { detail: states }),
	)
	emit('attentionChange', occurrences.value.length > 0)
}

function reviewOccurrence(occurrence: ComponentOccurrence) {
	if (!props.editor.chain().focus().setNodeSelection(occurrence.position).run()) return
	reportOpen.value = false
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-edit-component', {
			detail: {
				name: occurrence.name,
				props: occurrence.props,
				nodeType: occurrence.nodeType,
				position: occurrence.position,
			},
		}),
	)
}

function removeOccurrence(occurrence: ComponentOccurrence) {
	const node = props.editor.state.doc.nodeAt(occurrence.position)
	if (!node) return
	props.editor.view.dispatch(
		props.editor.state.tr.delete(occurrence.position, occurrence.position + node.nodeSize),
	)
}

function insertComponentFromSlashMenu(event: Event) {
	if (!(event instanceof CustomEvent) || !isString(event.detail?.name)) return
	const component = props.components.find((candidate) => candidate.name === event.detail.name)
	if (component) choose(component)
}

let editorDom: HTMLElement | undefined
onMounted(() => {
	editorDom = props.editor.view.dom
	editorDom.addEventListener('markdown-editor-edit-component', editComponentFromNodeView)
	editorDom.addEventListener('markdown-editor-insert-component', insertComponentFromSlashMenu)
	props.editor.on('update', scan)
	scan()
})
onBeforeUnmount(() => {
	editorDom?.removeEventListener('markdown-editor-edit-component', editComponentFromNodeView)
	editorDom?.removeEventListener('markdown-editor-insert-component', insertComponentFromSlashMenu)
	props.editor.off('update', scan)
})

watch(() => [props.components, props.metadataAuthoritative], scan, { deep: true })

watch(
	() => [props.disabled, props.insertionEnabled],
	/**
	 * Close insertion UI when Directus locks the interface or hides component insertion.
	 * Existing component editing remains available through the mounted node-view controller.
	 * @param values Current disabled and component-insertion states.
	 * @returns Nothing.
	 */
	(values) => {
		const [disabled, insertionEnabled] = values
		if (!disabled && insertionEnabled) return
		open.value = false
		if (disabled) propsDrawerOpen.value = false
	},
)
</script>

<template>
	<VDialog v-if="insertionEnabled" v-model="open" persistent>
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
							<div class="component-picker__label">
								{{ component.label }}
								<VChip v-if="metadataDeprecation(component)" x-small
									>Deprecated</VChip
								>
							</div>
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
		:target-position="targetPosition"
		:stale-properties="
			Boolean(
				selectedOccurrence?.missingProps.length ||
				selectedOccurrence?.emptyRequiredProps.length ||
				selectedOccurrence?.removedProps.length,
			)
		"
		:stale-slots="
			Boolean(
				selectedOccurrence?.missingSlots.length || selectedOccurrence?.removedSlots.length,
			)
		"
		:deleted-name="
			selectedOccurrence?.state === 'missing' ? selectedOccurrence.name : undefined
		"
	/>
	<ComponentPropsReport
		v-model="reportOpen"
		:occurrences="occurrences"
		:disabled="disabled"
		@edit="reviewOccurrence"
		@remove="removeOccurrence"
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
