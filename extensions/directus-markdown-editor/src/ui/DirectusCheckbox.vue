<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackCheckbox from './FallbackCheckbox.vue'

const props = defineProps<{ modelValue?: boolean; label?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const instance = getCurrentInstance()
const checkboxComponent = instance?.appContext.components.VCheckbox ?? FallbackCheckbox
</script>

<template>
	<component
		:is="checkboxComponent"
		:model-value="props.modelValue"
		:label="props.label"
		:disabled="props.disabled"
		:block="true"
		@update:model-value="emit('update:modelValue', $event)"
	/>
</template>
