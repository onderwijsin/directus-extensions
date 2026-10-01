<script setup lang="ts">
import { computed, useId } from 'vue'

const props = defineProps<{
	label: string
	id?: string
	description?: string
	error?: string
	required?: boolean
	disabled?: boolean
}>()

const generatedId = useId()
const controlId = computed(() => props.id ?? generatedId)
const describedBy = computed(
	() =>
		[
			props.description && `${controlId.value}-description`,
			props.error && `${controlId.value}-error`,
		]
			.filter(Boolean)
			.join(' ') || undefined,
)
</script>

<template>
	<div class="editor-field">
		<label class="editor-field__label" :for="controlId">
			<slot name="label">{{ label }}</slot>
			<span v-if="required" aria-hidden="true"> *</span>
		</label>
		<p v-if="description" :id="`${controlId}-description`" class="editor-field__description">
			{{ description }}
		</p>
		<slot
			:id="controlId"
			:described-by="describedBy"
			:invalid="Boolean(error)"
			:required="required"
			:disabled="disabled"
		/>
		<p v-if="error" :id="`${controlId}-error`" class="editor-field__error" role="alert">
			{{ error }}
		</p>
	</div>
</template>

<style scoped>
.editor-field {
	display: grid;
	gap: 0.5rem;
}
.editor-field__label {
	font-size: 0.8rem;
	font-weight: 600;
}
.editor-field__description {
	margin: 0;
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
}
.editor-field__error {
	margin: 0;
	color: var(--theme--danger, var(--danger));
	font-size: 0.75rem;
}
</style>
