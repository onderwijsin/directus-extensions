<script setup lang="ts">
import { computed } from 'vue'

import { parseVideoEmbed, videoEmbedPermissions, videoEmbedUrl } from '../../editor/video-embed'

const props = defineProps<{ src: string; permissions?: string }>()
const video = computed(() => parseVideoEmbed(props.src, props.permissions))
const playerUrl = computed(() => (video.value ? videoEmbedUrl(video.value) : undefined))
const resolvedPermissions = computed(() =>
	video.value ? videoEmbedPermissions(video.value.options) : undefined,
)
const providerLabel = computed(() => (video.value?.provider === 'youtube' ? 'YouTube' : 'Vimeo'))
</script>

<template>
	<div v-if="video" class="video-embed-preview" contenteditable="false">
		<iframe
			class="video-embed-preview__frame"
			:src="playerUrl"
			:title="`${providerLabel} video player`"
			:allow="resolvedPermissions"
			:allowfullscreen="video.options.allowFullscreen"
			referrerpolicy="strict-origin-when-cross-origin"
		/>
	</div>
</template>

<style scoped>
.video-embed-preview__frame {
	display: block;
	inline-size: 100%;
	aspect-ratio: 16 / 9;
	border: 0;
}
</style>
