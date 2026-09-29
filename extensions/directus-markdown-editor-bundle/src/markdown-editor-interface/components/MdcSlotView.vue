<script setup lang="ts">
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'

import { mdcNodeViewProps } from './mdcNodeViewProps'

const props = defineProps(mdcNodeViewProps)
</script>

<template>
	<NodeViewWrapper class="mdc-slot-view" data-mdc-node-view>
		<div class="mdc-slot-view__label" contenteditable="false">
			{{ props.node.attrs.name }}
		</div>
		<NodeViewContent class="mdc-slot-view__content" tabindex="0" />
	</NodeViewWrapper>
</template>

<style scoped>
.mdc-slot-view {
	margin-block: 0.5rem;
	padding-inline-start: 0.75rem;
	border-inline-start: 2px solid var(--theme--border-color, #d3dce3);
}

.mdc-slot-view__label {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	margin-block-end: 0.25rem;
	font-size: 0.6875rem;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--theme--foreground-subdued, #8b98a5);
}
</style>
