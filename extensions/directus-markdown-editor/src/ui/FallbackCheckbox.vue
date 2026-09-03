<script setup lang="ts">
const props = defineProps<{ modelValue?: boolean; label?: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
	<button
		type="button"
		class="fallback-checkbox"
		role="checkbox"
		:aria-checked="props.modelValue === true"
		:disabled="props.disabled"
		@click="emit('update:modelValue', !props.modelValue)"
	>
		<span aria-hidden="true">{{ props.modelValue ? '☑' : '☐' }}</span>
		{{ props.label }}
	</button>
</template>

<style scoped>
.fallback-checkbox {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0;
	border: 0;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}
</style>
