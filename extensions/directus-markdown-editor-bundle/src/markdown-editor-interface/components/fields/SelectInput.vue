<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
	values: string[]
}>()
const model = defineModel<string>({ required: true })
const items = computed(() => props.values.map((value) => ({ text: value, value })))
</script>

<template>
	<VSelect
		:id="id"
		v-model="model"
		:items="items"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
		:aria-required="required || undefined"
		:disabled="disabled"
	/>
</template>
