<script setup lang="ts">
defineProps<{
	active?: boolean
	disabled?: boolean
	primary?: boolean
	title?: string
	type?: 'button' | 'submit'
}>()
</script>

<template>
	<button
		class="fallback-button"
		:class="{ active, primary }"
		:disabled="disabled"
		:title="title"
		:type="type ?? 'button'"
	>
		<slot />
	</button>
</template>

<style scoped>
.fallback-button {
	border: 0;
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.fallback-button.active,
.fallback-button:hover:not(:disabled) {
	background: color-mix(in srgb, currentColor 12%, transparent);
}

.fallback-button.primary {
	padding: 0.5rem 0.875rem;
	border: 1px solid var(--theme--primary, #6644ff);
	border-radius: 0.25rem;
	background: var(--theme--primary, #6644ff);
	color: var(--theme--primary-foreground, white);
}

.fallback-button:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}
</style>
