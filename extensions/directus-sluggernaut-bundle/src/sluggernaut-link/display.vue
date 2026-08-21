<script setup lang="ts">
/** Data Studio display for a Sluggernaut slug or permalink. */
import { computed } from 'vue'

import CopyButton from '../shared/components/CopyButton.vue'
import { displayHref, displayHost } from './link'

const props = defineProps<{
	value?: string | null
	host?: string
}>()

const href = computed(() => displayHref(props.value, props.host))

/**
 * Opens the displayed path when a valid host is configured.
 * @returns void
 */
function openValue() {
	// Keep invalid or incomplete display configuration non-interactive rather than opening a bad URL.
	if (href.value === null || displayHost(props.host) === null) return
	window.open(href.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
	<div class="sluggernaut-link">
		<span class="sluggernaut-link__value">{{ value ?? '—' }}</span>
		<CopyButton :value="value ?? null" x-small />
		<v-button
			v-if="href !== null"
			x-small
			secondary
			icon
			aria-label="Open link"
			@click="openValue"
		>
			<v-icon name="open_in_new" small />
		</v-button>
	</div>
</template>

<style scoped>
.sluggernaut-link {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	width: 100%;
}

.sluggernaut-copy-button {
	opacity: 0;
	transition: opacity 0.1s ease-in;
}

.sluggernaut-link:hover .sluggernaut-copy-button {
	opacity: 1;
}

.sluggernaut-link__value {
	flex: 1;
}
</style>
