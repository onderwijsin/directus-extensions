<script setup lang="ts">
import type { ComponentMetadata } from '../component-meta/schema'

import { getCurrentInstance } from 'vue'

const props = defineProps<{ items: Pick<ComponentMetadata, 'name' | 'label' | 'description'>[] }>()
const emit = defineEmits<{ select: [name: string] }>()
const instance = getCurrentInstance()
const listComponent = instance?.appContext.components.VList
const itemComponent = instance?.appContext.components.VListItem

/**
 * Select a component from the Directus list.
 * @param name The selected component name.
 * @returns Nothing.
 */
function select(name: string) {
	emit('select', name)
}
</script>

<template>
	<component :is="listComponent" v-if="listComponent && itemComponent" class="directus-list">
		<component
			:is="itemComponent"
			v-for="item in props.items"
			:key="item.name"
			:clickable="true"
			@click="select(item.name)"
		>
			<span class="directus-list__item">
				<strong>{{ item.label }}</strong>
				<small v-if="item.description">{{ item.description }}</small>
			</span>
		</component>
	</component>
	<div v-else class="directus-list-fallback">
		<button
			v-for="item in props.items"
			:key="item.name"
			type="button"
			@click="select(item.name)"
		>
			<strong>{{ item.label }}</strong>
			<small v-if="item.description">{{ item.description }}</small>
		</button>
	</div>
</template>

<style scoped>
.directus-list__item,
.directus-list-fallback button {
	display: grid;
	gap: 0.125rem;
	min-width: 0;
	text-align: start;
}

.directus-list :deep(.v-list-item) {
	margin-block: 0.375rem;
}

.directus-list__item small,
.directus-list-fallback small {
	color: var(--theme--foreground-subdued, #8b98a5);
}

.directus-list-fallback {
	display: grid;
	gap: 0.125rem;
}

.directus-list-fallback button {
	padding: 0.5rem;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.directus-list-fallback button:hover {
	background: var(--theme--background-subdued, #f0f2f5);
}
</style>
