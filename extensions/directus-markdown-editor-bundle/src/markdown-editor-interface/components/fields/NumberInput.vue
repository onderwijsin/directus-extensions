<script setup lang="ts">
defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
}>()
const model = defineModel<number | ''>({ required: true })

/**
 * Preserve optional emptiness and reject non-finite numeric input.
 * @param value Directus input value.
 * @returns Nothing.
 */
function update(value: unknown) {
	if (value == null || value === '' || (typeof value === 'string' && !value.trim())) {
		model.value = ''
		return
	}
	const number = Number(value)
	if (Number.isFinite(number)) model.value = number
}
</script>

<template>
	<VInput
		:id="id"
		:model-value="model"
		type="number"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
		:aria-required="required || undefined"
		:error="invalid"
		:disabled="disabled"
		@update:model-value="update"
	/>
</template>
