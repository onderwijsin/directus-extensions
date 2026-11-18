<script setup lang="ts">
defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
	placeholder?: string
	autofocus?: boolean
}>()
const model = defineModel<string>({ required: true })
</script>

<template>
	<VInput
		:id="id"
		v-model="model"
		:nullable="false"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
		:aria-required="required || undefined"
		:error="invalid"
		:disabled="disabled"
		:placeholder="placeholder"
		:autofocus="autofocus"
	/>
</template>
