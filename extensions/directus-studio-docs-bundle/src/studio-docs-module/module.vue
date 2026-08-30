<script setup lang="ts">
import type { StudioDocsArticle, StudioDocsNavigationArticle } from './types'

import { onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import DocsArticle from './components/DocsArticle.vue'
import DocsNavigation from './components/DocsNavigation.vue'
import { useDocsArticle } from './composables/useDocsArticle'
import { useDocsNavigation } from './composables/useDocsNavigation'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const navigationApi = useDocsNavigation()
const articleApi = useDocsArticle()
const articles = shallowRef<StudioDocsNavigationArticle[]>([])
const selectedArticle = shallowRef<StudioDocsArticle | null>(null)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
/**
 * Loads the visible article navigation and current article data.
 * @returns Nothing.
 */
const load = async (): Promise<void> => {
	loading.value = true
	try {
		articles.value = await navigationApi.listArticles()
		const selectedNavigationArticle = props.id
			? articles.value.find((article) => article.id === props.id)
			: undefined
		selectedArticle.value =
			selectedNavigationArticle && props.id ? await articleApi.getArticle(props.id) : null
		error.value = null
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load documentation'
	} finally {
		loading.value = false
	}
}

/**
 * Navigates to a selected article without mutating the loaded article state.
 * @param id - Stable article identifier.
 * @returns Nothing.
 */
const selectArticle = (id: string): void => {
	void router.push(`/docs/${encodeURIComponent(id)}`)
}

onMounted(() => void load())
</script>

<template>
	<private-view :title="selectedArticle?.navigation_label ?? 'Docs'">
		<template #actions>
			<v-button
				icon
				rounded
				secondary
				:loading="loading"
				aria-label="Refresh documentation"
				@click="load"
			>
				<v-icon name="refresh" />
			</v-button>
		</template>
		<div class="studio-docs-page">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" class="loading-state" role="status">Loading documentation…</div>
			<v-info
				v-else-if="articles.length === 0"
				icon="menu_book"
				title="No documentation available"
				center
			>
				Documentation articles will appear here when they are published.
			</v-info>
			<div v-else class="docs-layout">
				<DocsNavigation
					:articles="articles"
					:selected-id="props.id"
					@select="selectArticle"
				/>
				<v-info
					v-if="props.id && !selectedArticle"
					icon="error_outline"
					title="Article not found"
					center
				>
					This documentation article is unavailable or archived.
				</v-info>
				<DocsArticle v-else-if="selectedArticle" :article="selectedArticle" />
				<v-info v-else icon="menu_book" title="Choose an article" center>
					Select an article from the navigation.
				</v-info>
			</div>
		</div>
	</private-view>
</template>

<style scoped>
.studio-docs-page {
	display: grid;
	gap: 24px;
	padding: var(--content-padding);
}
.docs-layout {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr);
	gap: 40px;
}
.loading-state {
	padding: 48px;
	color: var(--theme--foreground-subdued);
	text-align: center;
}
@media (max-width: 800px) {
	.docs-layout {
		grid-template-columns: 1fr;
	}
}
</style>
