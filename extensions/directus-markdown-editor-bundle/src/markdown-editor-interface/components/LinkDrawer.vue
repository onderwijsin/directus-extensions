<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
import type { Editor } from '@tiptap/core'

import { computed, reactive, shallowRef, watch } from 'vue'

import {
	linkValueError,
	readLinkRange,
	readLinkSelection,
	saveLinkSelection,
	type LinkType,
	type LinkRange,
	type LinkSelection,
} from '../editor/link'

const props = defineProps<{ editor: Editor; disabled?: boolean }>()
const open = defineModel<boolean>({ default: false })
const selection = reactive<LinkSelection>({ type: 'url', url: '', title: '', text: '' })
const range = shallowRef<LinkRange>({ from: 1, to: 1 })
const linkTypes: { text: string; value: LinkType }[] = [
	{ text: 'URL', value: 'url' },
	{ text: 'Internal', value: 'internal' },
	{ text: 'Email', value: 'email' },
	{ text: 'Phone', value: 'phone' },
]

const editing = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => Boolean(selection.url),
)
const valueError = computed(() => linkValueError(selection.type, selection.url))
const saveable = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => !valueError.value && selection.text.trim().length > 0,
)
const valueLabel = computed(() => {
	if (selection.type === 'internal') return 'Internal path'
	if (selection.type === 'email') return 'Email address'
	if (selection.type === 'phone') return 'Phone number'
	return 'URL'
})

watch(
	open,

	/**
	 * Editor callback.
	 * @param value Parameter value.
	 * @returns Callback result.
	 */
	(value) => {
		if (!value) return
		range.value = readLinkRange(props.editor)
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
	if (props.disabled) return
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
			<label for="link-type">Link type</label>
			<VSelect
				id="link-type"
				v-model="selection.type"
				:items="linkTypes"
				:disabled="disabled"
			/>
			<label for="link-value">Link value</label>
			<VInput
				id="link-value"
				v-model="selection.url"
				:label="valueLabel"
				:placeholder="selection.type === 'internal' ? '/about' : 'https://example.com'"
				:error="Boolean(valueError)"
				autofocus
				:disabled="disabled"
			/>
			<p v-if="valueError" class="link-drawer__error">{{ valueError }}</p>
			<label for="link-text">Link text</label>
			<VInput
				v-model="selection.text"
				placeholder="Link text"
				id="link-text"
				:error="selection.text.trim().length === 0"
				:disabled="disabled"
			/>
			<p v-if="selection.text.trim().length === 0" class="link-drawer__error">
				Link text is required.
			</p>
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
.link-drawer__error {
	margin: -0.65rem 0 0;
	color: var(--theme--danger, var(--danger));
	font-size: 0.75rem;
}

.link-drawer__form > label {
	font-size: 0.8rem;
	font-weight: 600;
}
</style>
