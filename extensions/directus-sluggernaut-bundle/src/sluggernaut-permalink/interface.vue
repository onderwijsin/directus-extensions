<script setup lang="ts">
import InputWithCopy from '../shared/InputWithCopy.vue'

const props = withDefaults(
	defineProps<{
		value?: string | null
		disabled?: boolean
	}>(),
	{ value: null, disabled: false },
)

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()
</script>

<template>
	<InputWithCopy v-bind="props" field-type="path" @input="emit('input', $event)" />
</template>
