<script setup lang="ts">
import type { StudioDocsArticle, StudioDocsNavigationArticle } from './types'

import { onMounted, shallowRef, watch } from 'vue'

import { attempt } from '@onderwijsin/directus-extension-utils'

import DocsArticle from './components/DocsArticle.vue'
import DocsNavigation from './components/DocsNavigation.vue'
import { useDocsArticle } from './composables/useDocsArticle'
import { useDocsNavigation } from './composables/useDocsNavigation'

const props = defineProps<{ id?: string }>()
const navigationApi = useDocsNavigation()
const articleApi = useDocsArticle()
const navigation = shallowRef<StudioDocsNavigationArticle[]>([])
const article = shallowRef<StudioDocsArticle | null>(null)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
/**
 * Loads the visible article navigation and current article data.
 * @returns Nothing.
 */
const load = async (): Promise<void> => {
	loading.value = true
	error.value = null
	const { data: navigationData } = await attempt(() => navigationApi.listArticles())
	navigation.value = navigationData ?? []

	if (!props.id) {
		article.value = null
		loading.value = false
		return
	}

	const { data: articleData, error: articleError } = await attempt(() =>
		articleApi.getArticle(props.id!),
	)
	article.value = articleData ?? null
	if (articleError) {
		error.value =
			articleError instanceof Error ? articleError.message : 'Unable to load article'
	}
	loading.value = false
}

onMounted(() => void load())
watch(
	() => props.id,
	() => void load(),
)
</script>

<template>
	<private-view :title="article?.navigation_label ?? 'Docs'">
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
		<template #title-outer:prepend>
			<v-icon :name="article?.icon ?? 'menu_book'" />
		</template>
		<template #navigation>
			<DocsNavigation :articles="navigation" :selected-id="props.id" />
		</template>
		<main class="container">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" role="status"></div>
			<v-info
				v-else-if="navigation.length === 0"
				icon="menu_book"
				title="No documentation available"
				center
			>
				Documentation articles will appear here when they are published.
			</v-info>
			<div v-else class="docs-layout">
				<v-info
					v-if="props.id && !article"
					icon="error_outline"
					title="Article not found"
					center
				>
					This documentation article is unavailable or archived.
				</v-info>
				<DocsArticle v-else-if="article" :article="article" />
				<v-info v-else icon="menu_book" title="Choose an article" center>
					Select an article from the navigation.
				</v-info>
			</div>
		</main>
	</private-view>
</template>

<style scoped>
.container {
	padding: var(--content-padding);
	width: 100%;
	max-width: 1024px;

	& > div + * {
		margin-bottom: var(--content-padding);
	}
}
</style>
