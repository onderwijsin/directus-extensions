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
import DirectusButton from '../ui/DirectusButton.vue'
import DirectusDrawer from '../ui/DirectusDrawer.vue'
import DirectusInput from '../ui/DirectusInput.vue'

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
	<DirectusDrawer
		v-model="open"
		title="Edit link"
		icon="link"
		@cancel="open = false"
		@apply="save"
	>
		<div class="link-drawer__form">
			<DirectusInput
				v-model="selection.url"
				label="URL"
				placeholder="https://example.com"
				autofocus
			/>
			<DirectusInput v-model="selection.text" label="Display text" placeholder="Link text" />
			<DirectusInput
				v-model="selection.title"
				label="Tooltip"
				placeholder="Optional tooltip"
			/>
		</div>

		<template #actions>
			<DirectusButton v-if="editing" label="Unlink" :disabled="disabled" @click="unlink" />
		</template>
		<template #actions:primary>
			<DirectusButton
				label="Save link"
				primary
				:disabled="!saveable || disabled"
				@click="save"
			/>
		</template>
	</DirectusDrawer>
</template>

<style scoped>
.link-drawer__form {
	display: grid;
	gap: 1rem;
}
</style>
