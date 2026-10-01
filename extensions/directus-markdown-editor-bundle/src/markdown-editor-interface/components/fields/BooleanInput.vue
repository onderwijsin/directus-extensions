<script setup lang="ts">
defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
}>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
	<VCheckbox
		:id="id"
		v-model="model"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
		:aria-required="required || undefined"
		:disabled="disabled"
	/>
</template>
