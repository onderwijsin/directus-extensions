<script setup lang="ts">
import type { StudioDocsNavigationArticle } from '../types'

defineProps<{ articles: StudioDocsNavigationArticle[]; selectedId?: string }>()

const emit = defineEmits<{
	select: [id: string]
}>()
</script>

<template>
	<nav class="docs-navigation" aria-label="Documentation">
		<v-list nav>
			<v-list-item
				v-for="article in articles"
				:key="article.id"
				:active="article.id === selectedId"
				@click="emit('select', article.id)"
			>
				<v-list-item-icon v-if="article.icon">
					<v-icon :name="article.icon" />
				</v-list-item-icon>
				<v-list-item-content>
					<v-text-overflow :text="article.navigation_label" />
				</v-list-item-content>
			</v-list-item>
		</v-list>
	</nav>
</template>

<style scoped>
.docs-navigation {
	min-width: 220px;
}
</style>
