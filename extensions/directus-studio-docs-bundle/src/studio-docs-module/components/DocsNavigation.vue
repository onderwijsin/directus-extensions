<script setup lang="ts">
import type { StudioDocsArticle } from '../types'

defineProps<{ articles: StudioDocsArticle[]; selectedId?: string }>()

const emit = defineEmits<{
	select: [id: string]
}>()
</script>

<template>
	<nav class="docs-navigation" aria-label="Documentation">
		<h2 class="navigation-title">Documentation</h2>
		<ul class="navigation-list">
			<li v-for="article in articles" :key="article.id">
				<button
					class="navigation-link"
					:class="{ selected: article.id === selectedId }"
					type="button"
					:aria-current="article.id === selectedId ? 'page' : undefined"
					@click="emit('select', article.id)"
				>
					<v-icon v-if="article.icon" :name="article.icon" small />
					<span>{{ article.navigation_label }}</span>
				</button>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
.docs-navigation {
	min-width: 220px;
}
.navigation-title {
	margin: 0 0 12px;
	font-size: 14px;
	font-weight: 600;
}
.navigation-list {
	display: grid;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.navigation-link {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px 10px;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: var(--theme--foreground);
	text-align: start;
	cursor: pointer;
}
.navigation-link:hover,
.navigation-link.selected {
	background: var(--theme--background-subdued);
}
</style>
