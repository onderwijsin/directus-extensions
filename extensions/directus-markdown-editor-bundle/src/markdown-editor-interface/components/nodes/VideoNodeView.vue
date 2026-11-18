<script setup lang="ts">
import { computed } from 'vue'

import { isString } from '@onderwijsin/directus-extension-utils'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'

import { sanitizeImageUrl } from '../../editor/media'
import { parseVideoEmbed } from '../../editor/video-embed'
import VideoEmbedPreview from '../fields/VideoEmbedPreview.vue'

const props = defineProps(nodeViewProps)
const source = computed(() => (isString(props.node.attrs.src) ? props.node.attrs.src : ''))
const permissions = computed(() =>
	isString(props.node.attrs.allow) ? props.node.attrs.allow : undefined,
)
const embed = computed(() => parseVideoEmbed(source.value))
</script>

<template>
	<NodeViewWrapper class="video-node-view">
		<VideoEmbedPreview v-if="embed" :src="source" :permissions="permissions" />
		<video v-else :src="sanitizeImageUrl(source)" controls preload="metadata" />
	</NodeViewWrapper>
</template>
