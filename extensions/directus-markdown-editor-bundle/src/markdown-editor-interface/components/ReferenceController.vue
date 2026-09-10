<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue controller callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { ReferenceSearchResult } from '../reference/api'
import type { ReferenceBookmark, ReferenceOccurrence } from '../reference/editor'
import type { ReferenceProps, ReferenceSnapshotMode } from '../reference/schema'

import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import { useApi, useStores } from '@directus/extensions-sdk'
import { isInteger } from '@onderwijsin/directus-extension-utils'

import { resolveReferences } from '../reference/api'
import {
	insertReference,
	removeReferenceAt,
	scanReferences,
	selectionBookmark,
	updateReferenceAt,
} from '../reference/editor'
import { parseReferenceProps, resolveReferenceCollections } from '../reference/schema'
import { setEditorReferenceStates } from '../reference/status'
import ReferenceDrawer from './ReferenceDrawer.vue'
import ReferencePicker from './ReferencePicker.vue'
import ReferenceReport from './ReferenceReport.vue'

const props = withDefaults(
	defineProps<{
		editor: Editor
		collections: unknown
		mode?: ReferenceSnapshotMode
		disabled?: boolean
		insertionEnabled?: boolean
		scanRevision?: number
	}>(),
	{ mode: 'detect', insertionEnabled: true, scanRevision: 0 },
)
const reportOpen = defineModel<boolean>('reportOpen', { default: false })
const emit = defineEmits<{ attentionChange: [needsAttention: boolean] }>()
const api = useApi()
const stores = useStores()
const fieldsStore = stores.useFieldsStore()
const collectionsStore = stores.useCollectionsStore()
const configuration = computed(() =>
	resolveReferenceCollections(
		props.collections,
		(collection) => fieldsStore.getFieldsForCollection(collection),
		(collection) => collectionsStore.getCollection(collection),
	),
)
const apiClient = {
	get: (url: string, options?: { signal?: AbortSignal }) => api.get(url, options),
}
const pickerOpen = shallowRef(false)
const drawerOpen = shallowRef(false)
const report = shallowRef<ReferenceOccurrence[]>([])
const selectedPosition = shallowRef<number>()
const selectedReference = shallowRef<ReferenceProps>()
const bookmark = shallowRef<ReferenceBookmark>()
const pickerPurpose = shallowRef<'insert' | 'replace'>('insert')
const pickerReturnSurface = shallowRef<'drawer' | 'report'>()
const refreshingSelectedSource = shallowRef(false)
let controller: AbortController | undefined
let editorDom: HTMLElement | undefined

const reportEntries = computed(() => report.value.filter((entry) => entry.state !== 'valid'))
const selectedStatus = computed(
	() => report.value.find((entry) => entry.position === selectedPosition.value)?.state,
)

function openPickerAt(nextBookmark: ReferenceBookmark) {
	if (!props.insertionEnabled || props.disabled || !props.editor.isEditable) return
	bookmark.value = nextBookmark
	pickerPurpose.value = 'insert'
	pickerReturnSurface.value = undefined
	pickerOpen.value = true
}

function handleOpen(event: Event) {
	if (!(event instanceof CustomEvent)) return
	const from = event.detail?.from
	const to = event.detail?.to
	if (isInteger(from) && isInteger(to)) openPickerAt({ from, to })
	else openPickerAt(selectionBookmark(props.editor))
}

function handleEdit(event: Event) {
	if (props.disabled || !props.editor.isEditable || !(event instanceof CustomEvent)) return
	const position = event.detail?.position
	if (!isInteger(position)) return
	const node = props.editor.state.doc.nodeAt(position)
	const parsed = parseReferenceProps(node?.attrs.props)
	selectedPosition.value = position
	selectedReference.value = parsed.success ? parsed.data : undefined
	drawerOpen.value = parsed.success
	if (parsed.success) void scan()
	if (!parsed.success) {
		const occurrence = report.value.find((entry) => entry.position === position)
		replace(
			occurrence ?? {
				key: `${position}:malformed`,
				position,
				rawProps: node?.attrs.props,
				state: 'malformed',
				sourceState: 'malformed',
				snapshotState: 'unchecked',
			},
		)
	}
}

function selectResult(result: ReferenceSearchResult) {
	if (pickerPurpose.value === 'insert' && bookmark.value) {
		insertReference(props.editor, result.reference, bookmark.value)
		return
	}
	const position = selectedPosition.value
	if (position === undefined) return
	const existing = selectedReference.value
	const replacement: ReferenceProps = {
		...result.reference,
		...(existing?.text ? { text: existing.text } : {}),
		...(existing?.icon ? { icon: existing.icon } : {}),
	}
	if (updateReferenceAt(props.editor, position, replacement)) {
		selectedReference.value = replacement
		report.value = report.value.filter((entry) => entry.position !== position)
		void scan()
	}
}

function applyPresentation(presentation: { text?: string; icon?: string }) {
	if (selectedPosition.value === undefined || !selectedReference.value) return
	const next: ReferenceProps = { ...selectedReference.value }
	delete next.text
	delete next.icon
	if (presentation.text !== undefined) next.text = presentation.text
	if (presentation.icon !== undefined) next.icon = presentation.icon
	if (updateReferenceAt(props.editor, selectedPosition.value, next))
		selectedReference.value = next
	drawerOpen.value = false
}

function changeSource() {
	pickerPurpose.value = 'replace'
	pickerReturnSurface.value = 'drawer'
	drawerOpen.value = false
	pickerOpen.value = true
}

async function refreshSelectedSource() {
	const position = selectedPosition.value
	const reference = selectedReference.value
	if (refreshingSelectedSource.value || position === undefined || !reference) return
	const config = configuration.value.collections.find(
		(collection) => collection.collection === reference.collection,
	)
	if (!config) return
	refreshingSelectedSource.value = true
	try {
		const result = await resolveReferences(apiClient, config, [reference.item])
		const current = result.items.get(String(reference.item))
		if (!current) return
		const next = { ...reference, label: current.label, data: current.data }
		if (updateReferenceAt(props.editor, position, next)) {
			selectedReference.value = next
			await scan()
		}
	} finally {
		refreshingSelectedSource.value = false
	}
}

function removeSelected() {
	if (selectedPosition.value === undefined) return
	const occurrence = report.value.find((entry) => entry.position === selectedPosition.value)
	remove(
		occurrence ?? {
			key: `${selectedPosition.value}:selected`,
			position: selectedPosition.value,
			rawProps: selectedReference.value,
			reference: selectedReference.value,
			state: 'valid',
			sourceState: 'available',
			snapshotState: 'current',
		},
	)
	drawerOpen.value = false
}

function refresh(occurrence: ReferenceOccurrence) {
	if (!occurrence.reference || !occurrence.current) return
	const next = {
		...occurrence.reference,
		label: occurrence.current.label,
		data: occurrence.current.data,
	}
	if (updateReferenceAt(props.editor, occurrence.position, next)) {
		report.value = report.value.filter((entry) => entry.key !== occurrence.key)
	}
}

function refreshAll() {
	for (const occurrence of report.value.filter((entry) => entry.state === 'outdated')) {
		refresh(occurrence)
	}
}

function replace(occurrence: ReferenceOccurrence) {
	selectedPosition.value = occurrence.position
	selectedReference.value = occurrence.reference
	pickerPurpose.value = 'replace'
	pickerReturnSurface.value = 'report'
	reportOpen.value = false
	pickerOpen.value = true
}

function remove(occurrence: ReferenceOccurrence) {
	if (removeReferenceAt(props.editor, occurrence.position)) {
		report.value = report.value
			.filter((entry) => entry.key !== occurrence.key)
			.map((entry) =>
				entry.position > occurrence.position
					? { ...entry, position: entry.position - 1 }
					: entry,
			)
	}
}

async function scan() {
	if (props.disabled) return
	controller?.abort()
	const request = new AbortController()
	controller = request
	const result = await scanReferences(
		props.editor,
		apiClient,
		configuration.value.collections,
		props.mode,
		request.signal,
	)
	if (request.signal.aborted) return
	report.value = result.occurrences
	setEditorReferenceStates(props.editor, result.occurrences)
	props.editor.view.dom.dispatchEvent(
		new CustomEvent('markdown-editor-reference-integrity', {
			detail: new Map(
				result.occurrences.map((occurrence) => [occurrence.position, occurrence.state]),
			),
		}),
	)
}

onMounted(() => {
	editorDom = props.editor.view.dom
	editorDom.addEventListener('markdown-editor-open-reference', handleOpen)
	editorDom.addEventListener('markdown-editor-edit-reference', handleEdit)
	void nextTick(() => void scan())
})
onBeforeUnmount(() => {
	controller?.abort()
	editorDom?.removeEventListener('markdown-editor-open-reference', handleOpen)
	editorDom?.removeEventListener('markdown-editor-edit-reference', handleEdit)
})

watch(
	() => props.scanRevision,
	() => void scan(),
)
watch([configuration, () => props.mode], () => void scan(), { deep: true })
watch(reportEntries, (entries) => emit('attentionChange', entries.length > 0), { immediate: true })
watch(
	() => props.disabled,
	(disabled) => {
		if (disabled) {
			controller?.abort()
			report.value = []
			pickerOpen.value = false
			drawerOpen.value = false
			reportOpen.value = false
			return
		}
		void scan()
	},
)
watch(pickerOpen, (isOpen) => {
	if (isOpen) return
	const surface = pickerReturnSurface.value
	pickerReturnSurface.value = undefined
	if (surface === 'drawer' && selectedReference.value) drawerOpen.value = true
	if (surface === 'report') reportOpen.value = true
})
</script>

<template>
	<p
		v-for="error in configuration.errors"
		:key="error"
		class="reference-configuration-error"
		role="alert"
	>
		{{ error }}
	</p>
	<ReferencePicker
		v-model="pickerOpen"
		:api="apiClient"
		:collections="configuration.collections"
		:disabled="disabled"
		@select="selectResult"
	/>
	<ReferenceDrawer
		v-model="drawerOpen"
		:reference="selectedReference"
		:status="selectedStatus"
		:disabled="disabled"
		:refreshing="refreshingSelectedSource"
		@apply="applyPresentation"
		@change-source="changeSource"
		@refresh-source="refreshSelectedSource"
		@remove="removeSelected"
	/>
	<ReferenceReport
		v-model="reportOpen"
		:occurrences="reportEntries"
		:disabled="disabled"
		@refresh="refresh"
		@refresh-all="refreshAll"
		@replace="replace"
		@remove="remove"
		@retry="scan"
	/>
</template>

<style scoped>
.reference-configuration-error {
	margin: 0;
	padding: 0.5rem 1rem;
	background: var(--theme--danger-background, #fff2f2);
	color: var(--theme--danger, #e35169);
	font-size: 0.75rem;
}
</style>
