<script setup lang="ts">
import type { StudioDocsArticle } from '../types'

import { Markdown } from '@comark/vue'

defineProps<{ article: StudioDocsArticle }>()
</script>

<template>
	<article class="article-layout">
		<div class="article-content">
			<Suspense>
				<Markdown :value="article.body" />
			</Suspense>
		</div>
	</article>
</template>

<style scoped>
.article-layout {
	max-width: 1100px;
	display: grid;
	grid-template-columns: minmax(0, 1fr) 220px;
	gap: 40px;
}
.article-content {
	min-width: 0;
	line-height: 1.65;
}

@media (max-width: 800px) {
	.article-layout {
		grid-template-columns: 1fr;
	}
}
</style>
