<script setup lang="ts">
import type { StudioDocsArticle } from '../types'

import 'github-markdown-css/github-markdown.css'
import { Markdown } from '@comark/vue'

defineProps<{ article: StudioDocsArticle }>()
</script>

<template>
	<article class="markdown-body">
		<Suspense>
			<Markdown :value="article.body" />
		</Suspense>
	</article>
</template>
