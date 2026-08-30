<script setup lang="ts">
import type { StudioDocsArticle } from '../types'

import { Markdown } from '@comark/vue'

defineProps<{ article: StudioDocsArticle }>()

/**
 * Formats an optional Directus audit timestamp for the current locale.
 * @param value - ISO timestamp returned by Directus.
 * @returns A readable date or an em dash when unavailable.
 */
const formatDate = (value: string | null): string => {
	if (!value) return '—'
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}
</script>

<template>
	<article class="docs-article">
		<header class="article-header">
			<h1>{{ article.navigation_label }}</h1>
			<p class="article-id">{{ article.id }}</p>
		</header>
		<div class="article-layout">
			<div class="article-content">
				<Markdown>{{ article.body }}</Markdown>
			</div>
			<aside class="article-audit" aria-label="Article details">
				<h2>Article details</h2>
				<dl>
					<div>
						<dt>Created</dt>
						<dd>{{ formatDate(article.date_created) }}</dd>
					</div>
					<div>
						<dt>Updated</dt>
						<dd>{{ formatDate(article.date_updated) }}</dd>
					</div>
					<div v-if="article.user_created">
						<dt>Created by</dt>
						<dd>{{ article.user_created }}</dd>
					</div>
				</dl>
			</aside>
		</div>
	</article>
</template>

<style scoped>
.docs-article {
	max-width: 1100px;
}
.article-header {
	margin-bottom: 28px;
}
.article-header h1 {
	margin: 0;
	font-size: 32px;
}
.article-id {
	margin: 8px 0 0;
	color: var(--theme--foreground-subdued);
	font-family: var(--family-monospace);
	font-size: 12px;
}
.article-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 220px;
	gap: 40px;
}
.article-content {
	min-width: 0;
	line-height: 1.65;
}
.article-audit {
	align-self: start;
	padding-left: 20px;
	border-left: 1px solid var(--border-normal);
}
.article-audit h2 {
	margin: 0 0 12px;
	font-size: 14px;
}
.article-audit dl {
	display: grid;
	gap: 12px;
	margin: 0;
}
.article-audit dt {
	color: var(--theme--foreground-subdued);
	font-size: 12px;
}
.article-audit dd {
	margin: 2px 0 0;
}
@media (max-width: 800px) {
	.article-layout {
		grid-template-columns: 1fr;
	}
	.article-audit {
		padding: 16px 0 0;
		border-top: 1px solid var(--border-normal);
		border-left: 0;
	}
}
</style>
