<script setup lang="ts">
const model = defineModel<string>({ default: '' })
defineProps<{ placeholder?: string; autofocus?: boolean; label?: string }>()
</script>

<template>
	<label class="fallback-input">
		<span v-if="label">{{ label }}</span>
		<input v-model="model" :autofocus="autofocus" :placeholder="placeholder" />
	</label>
</template>

<style scoped>
.fallback-input {
	display: grid;
	gap: 0.25rem;
}

input {
	min-block-size: 2rem;
	padding: 0.375rem 0.5rem;
	border: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
}
</style>
