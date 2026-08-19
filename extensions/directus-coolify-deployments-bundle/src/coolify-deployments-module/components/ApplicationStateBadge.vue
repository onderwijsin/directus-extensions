<script setup lang="ts">
defineProps<{ state: string | null; xSmall?: boolean }>()

/**
 * Convert a provider state to a stable CSS key.
 * @param state - Raw provider state.
 * @returns Lowercase state key.
 */
const stateKey = (state: string | null) => state?.split(':')[0]?.toLowerCase() ?? 'unknown'
/**
 * Format a provider state for display.
 * @param state - Raw provider state.
 * @returns Human-readable state label.
 */
const stateLabel = (state: string | null) => {
	const label = stateKey(state)
	return label.charAt(0).toUpperCase() + label.slice(1)
}
</script>

<template>
	<v-chip :class="['application-state', `state-${stateKey(state)}`]" :xSmall="xSmall">
		<span class="state-dot" style="text-transform: none" /> {{ stateLabel(state) }}
	</v-chip>
</template>

<style scoped>
.application-state :deep(.chip-content) {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	white-space: nowrap;
}
.state-dot {
	display: inline-block;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--foreground-subdued);
}
.state-running .state-dot {
	background: var(--success);
}
.state-exited .state-dot,
.state-stopped .state-dot {
	background: var(--danger);
}
</style>
