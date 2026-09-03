<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackSelect from './FallbackSelect.vue'

const props = defineProps<{
	items: { text: string; value: string }[]
	modelValue?: string
	label?: string
	disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const instance = getCurrentInstance()
const selectComponent = instance?.appContext.components.VSelect ?? FallbackSelect
</script>

<template>
	<component
		:is="selectComponent"
		:items="props.items"
		:model-value="props.modelValue"
		:label="false"
		:disabled="props.disabled"
		@update:model-value="emit('update:modelValue', $event)"
	/>
</template>
