<script setup lang="ts">
import { computed } from 'vue'

import CopyButton from '../shared/CopyButton.vue'
import { displayHref, displayHost, displayPath } from './link'

const props = defineProps<{
	value?: string | null
	options?: { host?: string | null }
}>()

const path = computed(() => displayPath(props.value))
const href = computed(() => displayHref(props.value, props.options?.host))

/**
 * Opens the displayed path when a valid host is configured.
 * @returns void
 */
function openValue() {
	if (href.value === null || displayHost(props.options?.host) === null) return
	window.open(href.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
	<div class="sluggernaut-link">
		<span class="sluggernaut-link__value">{{ value ?? '—' }}</span>
		<CopyButton v-if="path !== null" :value="value ?? null" x-small />
		<v-button
			v-if="href !== null"
			small
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
	gap: 0.5rem;
	width: 100%;
}

.sluggernaut-link__value {
	flex: 1;
}
</style>
