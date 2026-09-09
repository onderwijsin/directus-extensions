<script setup lang="ts">
import type { Editor } from '@tiptap/core'

// Applying source is explicit and guarded against lossy normalization.
import { computed, shallowRef, watch } from 'vue'

const props = defineProps<{ editor: Editor; disabled?: boolean }>()
const open = defineModel<boolean>({ default: false })
const source = shallowRef('')
const parseError = shallowRef<string | null>(null)
const normalized = shallowRef<string | null>(null)
const acceptNormalization = shallowRef(false)

watch(
	open,

	/**
	 * Editor callback.
	 * @param isOpen Parameter value.
	 * @returns Callback result.
	 */
	(isOpen) => {
		if (!isOpen) return
		source.value = props.editor.getMarkdown()
		parseError.value = null
		normalized.value = null
		acceptNormalization.value = false
	},
)

const hasLoss = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => normalized.value !== null && normalized.value !== source.value,
)
const canApply = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => !props.disabled && !parseError.value && (!hasLoss.value || acceptNormalization.value),
)

/**
 * Editor callback.
 * @returns Callback result.
 */
function validate() {
	parseError.value = null
	const markdown = props.editor.markdown
	if (!markdown) {
		parseError.value = 'Markdown support is not available.'
		return
	}
	try {
		const json = markdown.parse(source.value)
		normalized.value = markdown.serialize(json)
	} catch (cause) {
		parseError.value = cause instanceof Error ? cause.message : 'Markdown could not be parsed.'
		normalized.value = null
	}
}

/**
 * Editor callback.
 * @returns Callback result.
 */
function apply() {
	validate()
	if (!canApply.value) return
	const markdown = props.editor.markdown
	if (!markdown) return
	const json = markdown.parse(source.value)
	props.editor.commands.setContent(json)
	open.value = false
}
</script>

<template>
	<VDrawer
		:model-value="open"
		title="Edit Markdown"
		icon="code"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="apply"
	>
		<div class="source-drawer">
			<textarea
				v-model="source"
				class="source-drawer__textarea"
				:disabled="disabled"
				spellcheck="false"
				aria-label="Markdown source"
				@input="validate"
			/>
			<VNotice v-if="parseError" type="danger">{{ parseError }}</VNotice>
			<VNotice v-else-if="hasLoss" type="warning">
				The editor cannot represent this source exactly. Applying it may normalize or remove
				syntax.
				<VCheckbox
					v-model="acceptNormalization"
					:disabled="disabled"
					label="I understand and want to apply the normalized result."
				/>
			</VNotice>
		</div>
		<template #actions:primary
			><VButton :disabled="!canApply" small @click="apply">Apply source</VButton></template
		>
	</VDrawer>
</template>

<style scoped>
.source-drawer {
	display: grid;
	gap: 0.75rem;
	padding: var(--content-padding, 1.125rem);
}
.source-drawer__textarea {
	min-height: 24rem;
	width: 100%;
	padding: 0.75rem;
	border: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	border-radius: 0.25rem;
	background: transparent;
	font:
		0.8125rem/1.5 ui-monospace,
		SFMono-Regular,
		monospace;
	resize: vertical;
}
.source-drawer__error {
	margin: 0;
	color: var(--theme--danger, #e35169);
}
.source-drawer__warning {
	display: grid;
	gap: 0.5rem;
	color: var(--theme--warning, #d97706);
}
</style>
