<script setup lang="ts">
/** Data Studio display for a Sluggernaut slug or permalink. */
import { computed } from 'vue'

import CopyButton from '../shared/components/CopyButton.vue'
import { displayHref } from './link'

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
	if (href.value === null) return
	window.open(href.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
	<div class="sluggernaut-link">
		<span class="sluggernaut-link__value">{{ value ?? '—' }}</span>
		<div class="sluggernaut-link__actions">
			<CopyButton :value="value ?? null" x-small />
			<v-button
				v-if="href !== null"
				x-small
				secondary
				icon
				aria-label="Open link"
				@click.stop="openValue"
			>
				<v-icon name="open_in_new" small />
			</v-button>
		</div>
		<v-menu class="sluggernaut-link__menu" placement="bottom-end">
			<template #activator="{ toggle, active }">
				<v-icon
					class="sluggernaut-link__trigger"
					name="more_horiz"
					clickable
					aria-label="Link actions"
					:aria-expanded="active"
					@click.stop="toggle"
				/>
			</template>
			<div class="sluggernaut-link__menu-actions">
				<CopyButton :value="value ?? null" />
				<v-button
					v-if="href !== null"
					small
					secondary
					icon
					aria-label="Open link"
					@click="openValue"
				>
					<v-icon name="open_in_new" />
				</v-button>
			</div>
		</v-menu>
	</div>
</template>

<style scoped>
.sluggernaut-link {
	container: sluggernaut-link / inline-size;
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.25rem;
	inline-size: 100%;
	min-inline-size: 0;
}

.sluggernaut-link__value {
	flex: 1;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.sluggernaut-link__actions,
.sluggernaut-link__menu-actions {
	display: flex;
	flex: none;
	gap: 0.25rem;
}

.sluggernaut-link__menu-actions {
	padding-block: 0.25rem;
}

.sluggernaut-link__menu-actions :deep(.v-icon) {
	--v-icon-size: 1.5rem;
}

/* Directus applies a minimum width to the teleported menu. */
:global(.v-menu-popper:has(.sluggernaut-link__menu-actions)) {
	min-inline-size: 0;
}

.sluggernaut-link__actions:empty,
.sluggernaut-link__menu {
	display: none;
}

.sluggernaut-link__trigger {
	--v-icon-size: 1.5rem;
	background-color: var(--theme--background-normal);
	border-radius: var(--theme--border-radius);
}

.sluggernaut-link__trigger:hover {
	background-color: var(--theme--background-accent);
}

.sluggernaut-link__trigger:focus-visible {
	outline-offset: -2px;
}

@media (hover: hover) and (pointer: fine) {
	.sluggernaut-link {
		position: relative;
	}

	.sluggernaut-link__actions,
	.sluggernaut-link__menu {
		position: absolute;
		inset-inline-end: 0;
		opacity: 0;
		pointer-events: none;
	}

	.sluggernaut-link:is(:hover, :has(:focus-visible))
		> :is(.sluggernaut-link__actions, .sluggernaut-link__menu),
	.sluggernaut-link__menu:has(.sluggernaut-link__trigger[aria-expanded='true']),
	:global(
		.table-row
			> .cell:hover
			> .sluggernaut-link
			> :is(.sluggernaut-link__actions, .sluggernaut-link__menu)
	) {
		position: static;
		opacity: 1;
		pointer-events: auto;
		transition: opacity var(--sluggernaut-actions-fade-duration, 120ms) ease-out;
	}
}

@media (prefers-reduced-motion: reduce) {
	.sluggernaut-link {
		--sluggernaut-actions-fade-duration: 0ms;
	}
}

/* Two Directus x-small buttons (1.5rem each) plus the gap. */
@container sluggernaut-link (inline-size < 3.25rem) {
	.sluggernaut-link__actions:has(> :nth-child(2)) {
		display: none;
	}

	.sluggernaut-link__actions:has(> :nth-child(2)) + .sluggernaut-link__menu {
		display: block;
	}
}

@container sluggernaut-link (inline-size < 1.5rem) {
	.sluggernaut-link__actions {
		display: none;
	}

	.sluggernaut-link__actions:has(> *) + .sluggernaut-link__menu {
		display: block;
	}

	/* Reclaim Directus table cell padding when even one button can't fit inside it. */
	:global(.table-row > .cell > .sluggernaut-link > .sluggernaut-link__menu) {
		margin-inline-end: -0.6875rem;
	}
}
</style>
