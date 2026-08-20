<script setup lang="ts">
/** Data Studio display for a Sluggernaut slug or permalink. */
import { computed } from 'vue'

import CopyButton from '../shared/components/CopyButton.vue'
import { displayHref, displayHost } from './link'
import { linkDisplayOptionsSchema, type LinkDisplayOptions } from './options.schema'

const props = defineProps<{
	value?: string | null
	options?: LinkDisplayOptions
}>()

const parsedOptions = computed(() => linkDisplayOptionsSchema.safeParse(props.options ?? {}))
const host = computed(() => (parsedOptions.value.success ? parsedOptions.value.data.host : null))
const href = computed(() => displayHref(props.value, host.value))

/**
 * Opens the displayed path when a valid host is configured.
 * @returns void
 */
function openValue() {
	// Keep invalid or incomplete display configuration non-interactive rather than opening a bad URL.
	if (href.value === null || displayHost(host.value) === null) return
	window.open(href.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
	<div class="sluggernaut-link">
		<span class="sluggernaut-link__value">{{ value ?? '—' }}</span>
		<CopyButton :value="value ?? null" x-small />
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
