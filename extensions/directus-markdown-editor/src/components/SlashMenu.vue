<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { SlashItem } from '../editor/slash'

import { computed, nextTick, shallowRef, watch } from 'vue'

const props = defineProps<{
	items: SlashItem[]
	query: string
	command: (item: SlashItem) => void
}>()
const selectedIndex = shallowRef(0)

const groupedItems = computed(() => {
	const groups = new Map<string, SlashItem[]>()
	for (const item of props.items) {
		const existing = groups.get(item.group) ?? []
		existing.push(item)
		groups.set(item.group, existing)
	}
	return [...groups.entries()].map(([label, items]) => ({ label, items }))
})

watch(
	() => [props.query, props.items],
	() => {
		selectedIndex.value = 0
	},
)

function choose(item: SlashItem) {
	props.command(item)
}

function moveSelection(offset: number) {
	if (props.items.length === 0) return
	selectedIndex.value = (selectedIndex.value + offset + props.items.length) % props.items.length
	void nextTick(() =>
		document
			.getElementById(`slash-item-${selectedIndex.value}`)
			?.scrollIntoView({ block: 'nearest' }),
	)
}

function onKeyDown(event: KeyboardEvent) {
	if (event.key === 'ArrowDown') {
		moveSelection(1)
		return true
	}
	if (event.key === 'ArrowUp') {
		moveSelection(-1)
		return true
	}
	if (event.key === 'Home') {
		selectedIndex.value = 0
		return true
	}
	if (event.key === 'End') {
		selectedIndex.value = Math.max(0, props.items.length - 1)
		return true
	}
	if (event.key === 'Enter') {
		const item = props.items[selectedIndex.value]
		if (item) choose(item)
		return Boolean(item)
	}
	return event.key === 'Escape'
}

defineExpose({ onKeyDown })
</script>

<template>
	<div
		class="slash-menu"
		role="listbox"
		tabindex="-1"
		aria-label="Insert block"
		:aria-activedescendant="items[selectedIndex] ? `slash-item-${selectedIndex}` : undefined"
		@keydown="onKeyDown"
	>
		<VNotice v-if="items.length === 0" type="info">No commands match “{{ query }}”.</VNotice>
		<section v-for="group in groupedItems" :key="group.label" class="slash-menu__group">
			<div class="slash-menu__group-label">{{ group.label }}</div>
			<button
				v-for="item in group.items"
				:id="`slash-item-${items.indexOf(item)}`"
				:key="item.id"
				type="button"
				class="slash-menu__item"
				:class="{ 'is-selected': selectedIndex === items.indexOf(item) }"
				role="option"
				:aria-selected="selectedIndex === items.indexOf(item)"
				@mouseenter="selectedIndex = items.indexOf(item)"
				@mousedown.prevent
				@click="choose(item)"
			>
				<span class="slash-menu__icon"><VIcon :name="item.icon" /></span>
				<span class="slash-menu__copy"
					><strong>{{ item.label }}</strong
					><small>{{ item.description }}</small></span
				>
			</button>
		</section>
	</div>
</template>

<style scoped>
.slash-menu {
	width: min(22rem, calc(100vw - 2rem));
	max-height: min(30rem, 60vh);
	padding: 0.375rem;
	overflow-y: auto;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.375rem);
	background: var(--theme--background, white);
	box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 16%);
}

.slash-menu__group + .slash-menu__group {
	margin-block-start: 0.375rem;
	padding-block-start: 0.375rem;
	border-block-start: 1px solid var(--theme--border-color-subdued, #edf0f2);
}

.slash-menu__group-label {
	padding: 0.375rem 0.5rem;
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.6875rem;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.slash-menu__item {
	display: flex;
	align-items: center;
	width: 100%;
	gap: 0.75rem;
	padding: 0.5rem;
	border: 0;
	border-radius: var(--theme--border-radius, 0.25rem);
	background: transparent;
	color: var(--theme--foreground, #1f2937);
	text-align: start;
	cursor: pointer;
}

.slash-menu__item.is-selected,
.slash-menu__item:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}

.slash-menu__icon {
	display: grid;
	flex: 0 0 2rem;
	place-items: center;
	width: 2rem;
	height: 2rem;
	border: 1px solid var(--theme--border-color-subdued, #e4e8eb);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background-normal, #f7f8fa);
	color: var(--theme--primary, #6644ff);
}

.slash-menu__copy {
	display: grid;
	min-width: 0;
	gap: 0.125rem;
}
.slash-menu__copy small {
	overflow: hidden;
	color: var(--theme--foreground-subdued, #8b98a5);
	font-size: 0.75rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
