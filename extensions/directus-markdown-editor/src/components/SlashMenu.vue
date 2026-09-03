<script setup lang="ts">
import type { SlashItem } from '../editor/slash'

// Rendered by Tiptap's VueRenderer; keyboard handling is exposed to the suggestion extension.
import { computed, ref, watch } from 'vue'

const props = defineProps<{
	items: SlashItem[]
	query: string
	command: (item: SlashItem) => void
}>()
const selectedIndex = ref(0)
const filteredItems = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.items,
)

watch(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => [props.query, props.items],

	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		selectedIndex.value = 0
	},
)
const onKeyDown =
	/**
	 * Editor callback.
	 * @param event Parameter value.
	 * @returns Callback result.
	 */
	(event: KeyboardEvent) => {
		if (event.key === 'ArrowDown') {
			selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1)
			return true
		}
		if (event.key === 'ArrowUp') {
			selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
			return true
		}
		if (event.key === 'Enter' && filteredItems.value[selectedIndex.value]) {
			const item = filteredItems.value[selectedIndex.value]
			if (item) props.command(item)
			return true
		}
		return event.key === 'Escape'
	}

defineExpose({ onKeyDown })
</script>

<template>
	<div class="markdown-editor__slash-menu" role="listbox" aria-label="Insert block">
		<div v-if="filteredItems.length === 0" class="markdown-editor__slash-empty">
			No commands
		</div>
		<button
			v-for="(item, index) in filteredItems"
			:key="item.id"
			type="button"
			class="markdown-editor__slash-item"
			:class="{ 'is-selected': selectedIndex === index }"
			:aria-selected="selectedIndex === index"
			@click="command(item)"
		>
			<span class="markdown-editor__slash-icon">{{ item.icon }}</span>
			<span>
				<strong>{{ item.label }}</strong>
				<small>{{ item.description }}</small>
			</span>
		</button>
	</div>
</template>

<style scoped>
.markdown-editor__slash-menu {
	\tmin-width: 14rem;
	max-width: 18rem;
	padding: 0.25rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: 0.375rem;
	background: var(--theme--background, white);
	box-shadow: 0 0.5rem 1.25rem rgb(0 0 0 / 14%);
}

.markdown-editor__slash-item {
	display: flex;
	align-items: center;
	width: 100%;
	gap: 0.625rem;
	padding: 0.5rem;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	text-align: start;
	cursor: pointer;
}

.markdown-editor__slash-item.is-selected,
.markdown-editor__slash-item:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}

.markdown-editor__slash-item small {
	display: block;
	color: var(--theme--foreground-subdued, #8b98a5);
}

.markdown-editor__slash-icon {
	width: 1.25rem;
	text-align: center;
}

.markdown-editor__slash-empty {
	padding: 0.75rem;
	color: var(--theme--foreground-subdued, #8b98a5);
}
</style>
