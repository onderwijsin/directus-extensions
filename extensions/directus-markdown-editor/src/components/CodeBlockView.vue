<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue NodeView callbacks are private component behavior. */
import { computed } from 'vue'

import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'

import { useEditorEditable } from '../composables/useEditorEditable'
import { codeLanguageOptions } from '../editor/code-languages'

const props = defineProps(nodeViewProps)
const editable = useEditorEditable(props.editor)
const language = computed(() =>
	typeof props.node.attrs.language === 'string' ? props.node.attrs.language : '',
)
const languageLabel = computed(
	() =>
		codeLanguageOptions.find((option) => option.value === language.value)?.text ??
		language.value,
)
const filename = computed(() =>
	typeof props.node.attrs.filename === 'string' ? props.node.attrs.filename : '',
)
const collapse = computed(() => props.node.attrs.collapse === true)
const collapseIcon = computed(() => (collapse.value ? 'expand_content' : 'collapse_content'))
const collapseTooltip = computed(() =>
	collapse.value ? 'Keep code block expanded' : 'Make code block collapsible',
)

function updateLanguage(value: string | number | null) {
	if (!editable.value) return
	props.updateAttributes({ language: typeof value === 'string' ? value : null })
}

function updateFilename(value: string | null) {
	if (!editable.value) return
	props.updateAttributes({ filename: value?.trim() || null })
}

function updateCollapse(value: boolean) {
	if (!editable.value) return
	props.updateAttributes({ collapse: value })
}
</script>

<template>
	<NodeViewWrapper class="code-block" :class="{ 'is-collapsible': collapse }">
		<div class="code-block__settings" contenteditable="false">
			<div class="code-block__language">
				<VSelect
					:model-value="language"
					:items="codeLanguageOptions"
					:disabled="!editable"
					show-deselect
					@update:model-value="updateLanguage"
				>
					<template #preview="{ toggle, active }">
						<VInput
							:model-value="languageLabel"
							small
							full-width
							readonly
							clickable
							:active="active"
							:disabled="!editable"
							placeholder="Language"
							aria-label="Code language"
							@click="toggle"
							@keydown:enter="toggle"
							@keydown:space="toggle"
						/>
					</template>
				</VSelect>
			</div>
			<div class="code-block__filename">
				<VInput
					:model-value="filename"
					:disabled="!editable"
					small
					full-width
					placeholder="Filename"
					aria-label="Code filename or path"
					@update:model-value="updateFilename"
				/>
			</div>
			<VButton
				icon
				small
				ghost
				class="code-block__collapse"
				:disabled="!editable"
				:tooltip="collapseTooltip"
				:aria-label="collapseTooltip"
				:aria-pressed="collapse"
				@click="updateCollapse(!collapse)"
			>
				<VIcon :name="collapseIcon" />
			</VButton>
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
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #e4e8eb);
	background: var(--theme--background-subdued, #f7f8f9);
}

.code-block__language,
.code-block__filename {
	min-width: 0;
}

.code-block__collapse {
	flex: 0 0 auto;
}

.markdown-editor
	.ProseMirror
	.code-block.shiki
	.code-block__settings
	.code-block__collapse
	button.ghost
	span.content,
.markdown-editor .ProseMirror .code-block.shiki .code-block__collapse span.v-icon {
	background-color: transparent !important;
}

.code-block__pre {
	margin: 0;
	border-radius: 0;
}
</style>
