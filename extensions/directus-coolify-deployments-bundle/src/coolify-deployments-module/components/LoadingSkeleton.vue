<script setup lang="ts">
withDefaults(defineProps<{ lines?: number }>(), { lines: 3 })
</script>

<template>
	<div class="skeleton" aria-hidden="true">
		<div
			v-for="line in lines"
			:key="line"
			class="skeleton-line"
			:class="{ short: line === lines }"
		/>
	</div>
</template>

<style scoped>
.skeleton {
	display: grid;
	gap: 12px;
	padding: 20px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
}
.skeleton-line {
	height: 14px;
	border-radius: 4px;
	background: linear-gradient(
		90deg,
		var(--background-normal) 25%,
		var(--background-highlight) 50%,
		var(--background-normal) 75%
	);
	background-size: 200% 100%;
	animation: shimmer 1.4s infinite;
}
.skeleton-line.short {
	width: 42%;
}
@keyframes shimmer {
	to {
		background-position: -200% 0;
	}
}
</style>
