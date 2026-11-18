<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue controller callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { ReferenceBookmark } from '../../reference/editor'
import type { RelatedItem } from '../../related-items/schema'

import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import { useApi, useStores } from '@directus/extensions-sdk'
import { isInteger } from '@onderwijsin/directus-extension-utils'

import { selectionBookmark } from '../../reference/editor'
import { resolveReferenceCollections } from '../../reference/schema'
import { RelatedItemListPropsSchema } from '../../related-items/schema'
import RelatedItemListDrawer from './RelatedItemListDrawer.vue'

const props = defineProps<{ editor: Editor; collections: unknown; disabled?: boolean }>()
const api = useApi()
const stores = useStores()
const fields = stores.useFieldsStore()
const collectionsStore = stores.useCollectionsStore()
const configuration = computed(() =>
	resolveReferenceCollections(
		props.collections,
		(collection) => fields.getFieldsForCollection(collection),
		(collection) => collectionsStore.getCollection(collection),
	),
)
const apiClient = {
	get: (url: string, options?: { signal?: AbortSignal }) => api.get(url, options),
}
const open = shallowRef(false)
const items = shallowRef<RelatedItem[]>([])
const invalid = shallowRef(false)
let bookmark: ReferenceBookmark | undefined
let targetPosition: number | undefined
let targetNode: ProseMirrorNode | undefined
let editorDom: HTMLElement | undefined

function canInteract() {
	return !props.disabled && props.editor.isEditable
}

function insert() {
	if (!canInteract() || props.editor.isActive('codeBlock')) return
	bookmark = selectionBookmark(props.editor)
	targetPosition = undefined
	targetNode = undefined
	items.value = []
	invalid.value = false
	open.value = true
}

function edit(event: Event) {
	if (!canInteract() || !(event instanceof CustomEvent)) return
	const position = event.detail?.position
	if (!isInteger(position)) return
	const node = props.editor.state.doc.nodeAt(position)
	if (node?.type.name !== 'mdcBlock' || node.attrs.name !== 'RelatedItemList') return
	const parsed = RelatedItemListPropsSchema.safeParse(node.attrs.props)
	items.value = parsed.success ? parsed.data.items : []
	invalid.value = !parsed.success
	targetPosition = position
	targetNode = node
	bookmark = undefined
	open.value = true
}

function apply(nextItems: RelatedItem[]) {
	if (!open.value || !canInteract() || invalid.value || !nextItems.length) return
	const parsed = RelatedItemListPropsSchema.safeParse({ items: nextItems })
	if (!parsed.success) return
	if (targetPosition !== undefined) {
		const node = props.editor.state.doc.nodeAt(targetPosition)
		if (node !== targetNode || !node) return
		props.editor.view.dispatch(
			props.editor.state.tr.setNodeMarkup(targetPosition, undefined, {
				...node.attrs,
				props: { ...node.attrs.props, items: parsed.data.items },
				propsFormat: 'yaml',
			}),
		)
	} else if (bookmark) {
		props.editor
			.chain()
			.focus()
			.setTextSelection(bookmark)
			.insertContent({
				type: 'mdcBlock',
				attrs: { name: 'RelatedItemList', props: parsed.data, propsFormat: 'yaml' },
			})
			.run()
	}
	open.value = false
}

function mapTarget({ transaction }: { transaction: Transaction }) {
	if (!open.value || !transaction.docChanged) return
	if (targetPosition !== undefined) {
		const mapped = transaction.mapping.mapResult(targetPosition, 1)
		if (mapped.deleted || props.editor.state.doc.nodeAt(mapped.pos) !== targetNode)
			open.value = false
		else targetPosition = mapped.pos
	} else if (bookmark) {
		const from = transaction.mapping.mapResult(bookmark.from, 1)
		const to = transaction.mapping.mapResult(bookmark.to, -1)
		if (from.deletedAcross || to.deletedAcross) open.value = false
		else bookmark = { from: from.pos, to: Math.max(from.pos, to.pos) }
	}
}

onMounted(() => {
	editorDom = props.editor.view.dom
	editorDom.addEventListener('markdown-editor-open-related-items', insert)
	editorDom.addEventListener('markdown-editor-edit-related-items', edit)
	props.editor.on('transaction', mapTarget)
})
onBeforeUnmount(() => {
	editorDom?.removeEventListener('markdown-editor-open-related-items', insert)
	editorDom?.removeEventListener('markdown-editor-edit-related-items', edit)
	props.editor.off('transaction', mapTarget)
})
watch(
	() => props.disabled,
	(value) => {
		if (value) open.value = false
	},
)
</script>

<template>
	<RelatedItemListDrawer
		v-model="open"
		:api="apiClient"
		:collections="configuration.collections"
		:items="items"
		:errors="configuration.errors"
		:invalid="invalid"
		:disabled="disabled"
		@apply="apply"
	/>
</template>
