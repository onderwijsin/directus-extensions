<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'

import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
</script>

<template>
	<NodeViewWrapper as="span" class="mdc-inline-view" data-mdc-node-view>
		<span class="mdc-inline-view__icon">◈</span>{{ props.node.attrs.name }}
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-inline-view {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding-inline: 0.3rem;
	border: 1px solid var(--theme--primary, #6644ff);
	border-radius: 0.25rem;
	background: color-mix(in srgb, var(--theme--primary, #6644ff) 8%, transparent);
	font-size: 0.8em;
	color: var(--theme--primary, #6644ff);
}
</style>
