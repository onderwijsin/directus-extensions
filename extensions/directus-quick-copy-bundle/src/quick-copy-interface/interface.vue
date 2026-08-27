<script setup lang="ts">
import { computed } from 'vue'

/** Readonly Directus input that keeps the native field presentation and adds copying. */
import CopyButton from '../shared/CopyButton.vue'

const props = defineProps<{
	value?: string | number | null
}>()

const displayValue = computed(() =>
	props.value === null || props.value === undefined ? '' : String(props.value),
)
</script>

<template>
	<div class="quick-copy-input">
		<v-input :model-value="displayValue" disabled />
		<CopyButton v-if="!!displayValue" :value="displayValue" />
	</div>
</template>

<style scoped>
.quick-copy-input {
	display: flex;
	position: relative;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
}

.quick-copy-input :deep(.input) {
	flex: 1;
}

.quick-copy-input .quick-copy-button {
	position: absolute;
	right: 0.5rem;
	top: 50%;
	transform: translateY(-50%);
}
</style>
