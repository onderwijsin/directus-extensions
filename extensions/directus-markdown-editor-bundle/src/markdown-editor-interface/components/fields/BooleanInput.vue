<script setup lang="ts">
withDefaults(
	defineProps<{
		id?: string
		describedBy?: string
		invalid?: boolean
		required?: boolean
		disabled?: boolean
		block?: boolean
	}>(),
	{
		block: true,
	},
)
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
		:block="block"
		label="Enabled"
	/>
</template>
