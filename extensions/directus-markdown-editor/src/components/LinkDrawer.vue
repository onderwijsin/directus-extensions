<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
import type { Editor } from '@tiptap/core'

import { computed, reactive, shallowRef, watch } from 'vue'

import {
	readLinkSelection,
	saveLinkSelection,
	type LinkRange,
	type LinkSelection,
} from '../editor/link'

const props = defineProps<{ editor: Editor; disabled?: boolean }>()
const open = defineModel<boolean>({ default: false })
const selection = reactive<LinkSelection>({ url: '', title: '', text: '' })
const range = shallowRef<LinkRange>({ from: 1, to: 1 })

const editing = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => Boolean(selection.url),
)
const saveable = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => selection.url.trim().length > 0,
)

watch(
	open,

	/**
	 * Editor callback.
	 * @param value Parameter value.
	 * @returns Callback result.
	 */
	(value) => {
		if (!value) return
		const current = props.editor.state.selection
		range.value = { from: current.from, to: current.to }
		Object.assign(selection, readLinkSelection(props.editor))
	},
)

/**
 * Editor callback.
 * @returns Callback result.
 */
function save() {
	if (!saveable.value || props.disabled) return
	if (saveLinkSelection(props.editor, selection, range.value)) open.value = false
}

/**
 * Editor callback.
 * @returns Callback result.
 */
function unlink() {
	props.editor.chain().focus().setTextSelection(range.value).unsetLink().run()
	open.value = false
}
</script>

<template>
	<VDrawer
		:model-value="open"
		title="Edit link"
		icon="link"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="save"
	>
		<div class="link-drawer__form">
			<VInput
				v-model="selection.url"
				label="URL"
				placeholder="https://example.com"
				autofocus
			/>
			<VInput v-model="selection.text" placeholder="Link text" />
		</div>

		<template #actions>
			<VButton v-if="editing" secondary small :disabled="disabled" @click="unlink"
				>Unlink</VButton
			>
		</template>
		<template #actions:primary>
			<VButton :disabled="!saveable || disabled" small @click="save">Save link</VButton>
		</template>
	</VDrawer>
</template>

<style scoped>
.link-drawer__form {
	display: grid;
	gap: 1rem;
	padding: var(--content-padding, 1.125rem);
}
</style>
