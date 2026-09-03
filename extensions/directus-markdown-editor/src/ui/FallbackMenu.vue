<script setup lang="ts">
// Fallback menu callbacks are local DOM behavior and do not need public API JSDoc.
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{ modelValue?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

/**
 * Editor callback.
 * @returns Callback result.
 */
function toggle() {
	open.value = !open.value
	emit('update:modelValue', open.value)
}

/**
 * Editor callback.
 * @param event Parameter value.
 * @returns Callback result.
 */
function close(event: MouseEvent) {
	if (!(event.target instanceof Node)) return
	if (!root.value?.contains(event.target)) open.value = false
}

onMounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => document.addEventListener('click', close, true),
)
onUnmounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => document.removeEventListener('click', close, true),
)
</script>

<template>
	<div ref="root" class="fallback-menu">
		<div class="fallback-activator">
			<slot name="activator" :toggle="toggle" />
		</div>
		<div v-if="open" class="fallback-content">
			<slot />
		</div>
	</div>
</template>

<style scoped>
.fallback-menu {
	position: relative;
}

.fallback-content {
	position: absolute;
	z-index: 10;
	min-width: 12rem;
	padding: 0.375rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: 0.25rem;
	background: var(--theme--background, white);
	box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 12%);
}
</style>
