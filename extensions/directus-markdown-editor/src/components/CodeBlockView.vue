<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue NodeView callbacks are private component behavior. */
import { computed } from 'vue'

import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const language = computed(() =>
	typeof props.node.attrs.language === 'string' ? props.node.attrs.language : '',
)
const filename = computed(() =>
	typeof props.node.attrs.filename === 'string' ? props.node.attrs.filename : '',
)
const collapse = computed(() => props.node.attrs.collapse === true)

function updateLanguage(value: string | null) {
	props.updateAttributes({ language: value?.trim() || null })
}

function updateFilename(value: string | null) {
	props.updateAttributes({ filename: value?.trim() || null })
}

function updateCollapse(value: boolean) {
	props.updateAttributes({ collapse: value })
}
</script>

<template>
	<NodeViewWrapper class="code-block" :class="{ 'is-collapsible': collapse }">
		<div class="code-block__settings" contenteditable="false">
			<VInput
				class="code-block__language"
				:model-value="language"
				small
				placeholder="Language"
				aria-label="Code language"
				@update:model-value="updateLanguage"
			/>
			<VInput
				class="code-block__filename"
				:model-value="filename"
				small
				placeholder="Filename or path (optional)"
				aria-label="Code filename or path"
				@update:model-value="updateFilename"
			/>
			<VCheckbox
				:model-value="collapse"
				label="Collapsible"
				@update:model-value="updateCollapse"
			/>
		</div>
		<pre class="code-block__pre"><NodeViewContent as="code" /></pre>
	</NodeViewWrapper>
</template>

<style scoped>
.code-block {
	margin-block: 1.5em;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background-normal, #f0f2f5);
	overflow: clip;
}

.code-block__settings {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #e4e8eb);
	background: var(--theme--background-subdued, #f7f8f9);
}

.code-block__language {
	flex: 0 0 8rem;
}

.code-block__filename {
	flex: 1 1 14rem;
	min-width: 8rem;
}

.code-block__pre {
	margin: 0;
	border-radius: 0;
}

@media (max-width: 40rem) {
	.code-block__settings {
		align-items: stretch;
		flex-wrap: wrap;
	}

	.code-block__language,
	.code-block__filename {
		flex: 1 1 10rem;
	}
}
</style>
