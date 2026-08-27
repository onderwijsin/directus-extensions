<script setup lang="ts">
import { computed } from 'vue'

/** Displays a scalar Directus field value with a copy action. */
import CopyButton from '../shared/CopyButton.vue'

const props = defineProps<{
	value?: string | number | null
}>()

const displayValue = computed(() =>
	props.value === null || props.value === undefined ? '—' : String(props.value),
)

const copyValue = computed(() =>
	props.value === null || props.value === undefined ? null : String(props.value),
)
</script>

<template>
	<div class="quick-copy-display">
		<span class="quick-copy-display__value">{{ displayValue }}</span>
		<CopyButton :value="copyValue" x-small />
	</div>
</template>

<style scoped>
.quick-copy-display {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	width: 100%;
}

.quick-copy-display__value {
	flex: 1;
}
</style>
