<script setup lang="ts">
defineProps<{ modelValue?: boolean; title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; cancel: []; apply: [] }>()
</script>

<template>
	<div v-if="modelValue" class="fallback-drawer">
		<button class="fallback-drawer__overlay" aria-label="Close" @click="emit('cancel')" />
		<aside class="fallback-drawer__panel" role="dialog" aria-modal="true" :aria-label="title">
			<header>
				<h2>{{ title }}</h2>
				<button @click="emit('cancel')">×</button>
			</header>
			<main><slot /></main>
			<footer><slot name="actions" /><button @click="emit('apply')">Save</button></footer>
		</aside>
	</div>
</template>

<style scoped>
.fallback-drawer,
.fallback-drawer__overlay {
	position: fixed;
	inset: 0;
}

.fallback-drawer {
	z-index: 20;
}

.fallback-drawer__overlay {
	border: 0;
	background: rgb(0 0 0 / 35%);
}

.fallback-drawer__panel {
	position: absolute;
	inset-block: 0;
	inset-inline-end: 0;
	display: flex;
	flex-direction: column;
	inline-size: min(32rem, 100%);
	background: var(--theme--background, white);
	box-shadow: -0.5rem 0 2rem rgb(0 0 0 / 12%);
}

header,
footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 1rem;
}

main {
	flex: 1;
}
</style>
