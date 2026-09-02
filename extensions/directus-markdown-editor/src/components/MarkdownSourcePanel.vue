<script setup lang="ts">
// This local DOM event adapter is not part of the component's public API.
// oxlint-disable jsdoc/require-param, jsdoc/require-returns
const props = defineProps<{ modelValue: string; disabled?: boolean; required?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; apply: []; cancel: [] }>()

/**
 *
 */
function updateValue(event: Event) {
	emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
	<div class="markdown-source-panel">
		<div class="markdown-source-panel__notice">
			<strong>{{ required ? 'Source editing required' : 'Source mode' }}</strong>
			<span>
				{{
					required
						? 'This content contains syntax the visual editor cannot safely represent.'
						: 'Edit the persisted MDC Markdown directly.'
				}}
			</span>
		</div>
		<textarea
			:value="modelValue"
			:disabled="disabled"
			aria-label="MDC Markdown source"
			@input="updateValue"
		/>
		<div class="markdown-source-panel__actions">
			<button v-if="!required" type="button" :disabled="disabled" @click="emit('cancel')">
				Cancel
			</button>
			<button type="button" :disabled="disabled" @click="emit('apply')">
				Apply Markdown
			</button>
		</div>
	</div>
</template>

<style scoped>
.markdown-source-panel {
	display: grid;
	gap: 0.75rem;
	padding: 1rem;
}
.markdown-source-panel__notice {
	display: grid;
	gap: 0.25rem;
	font-size: 0.8rem;
}
.markdown-source-panel__notice span {
	opacity: 0.75;
}
.markdown-source-panel textarea {
	min-height: 18rem;
	width: 100%;
	padding: 0.75rem;
	border: 1px solid var(--theme--form--field--input--border-color, #c8d0d9);
	border-radius: 4px;
	font:
		0.85rem/1.5 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
	resize: vertical;
}
.markdown-source-panel__actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
}
.markdown-source-panel button {
	border: 0;
	border-radius: 3px;
	padding: 0.4rem 0.6rem;
	background: var(--theme--primary, #6644ff);
	color: #fff;
	cursor: pointer;
}
.markdown-source-panel button:first-child {
	background: transparent;
	color: inherit;
}
.markdown-source-panel button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}
</style>
