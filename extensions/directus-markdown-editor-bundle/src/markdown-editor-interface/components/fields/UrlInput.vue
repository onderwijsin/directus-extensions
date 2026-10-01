<script setup lang="ts">
import StringInput from './StringInput.vue'

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
	<StringInput
		v-model="model"
		:id="id"
		:described-by="describedBy"
		:invalid="invalid"
		:required="required"
		:disabled="disabled"
		:placeholder="placeholder ?? 'https://example.com'"
		:autofocus="autofocus"
		inputmode="url"
	/>
</template>
