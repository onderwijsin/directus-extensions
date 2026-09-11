<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { EditorAiScope, EditorSkillMenuItem, SelectionSnapshot } from '../ai/types'
import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import { useApi, useStores } from '@directus/extensions-sdk'
import { z } from 'zod'

import { editorSkillMenuItemSchema } from '../../shared/editor-skill'
import { diffMarkdown } from '../ai/diff'
import { clearPendingAiSuggestion, showPendingAiSuggestion } from '../ai/pending'
import { captureSelection, replaceSelection } from '../ai/selection'

const props = defineProps<{
	editor: Editor
	collection: string
	field: string
	value: string
	disabled?: boolean
	components?: ComponentMetadata[]
}>()
const emit = defineEmits<{
	applyDocument: [content: string]
	skillsChange: [skills: EditorSkillMenuItem[]]
}>()
const api = useApi()
const notifications = useStores().useNotificationsStore()
const skills = shallowRef<EditorSkillMenuItem[]>([])
const loading = shallowRef(false)
const menuOpen = shallowRef(false)
const promptOpen = shallowRef(false)
const prompt = shallowRef('')
const requestedScope = shallowRef<EditorAiScope>('document')
const documentProposal = shallowRef<string>()
const documentSnapshot = shallowRef<string>()
const selectionSnapshot = shallowRef<SelectionSnapshot>()
const lastRequest = shallowRef<{ scope: EditorAiScope; skillId?: string; prompt?: string }>()
const insertionPosition = shallowRef<number>()
const comparison = computed(() =>
	diffMarkdown(documentSnapshot.value ?? props.value, documentProposal.value ?? props.value),
)
const documentSkills = computed(() =>
	skills.value.filter((skill) => !skill.archived && skill.scopes.includes('document')),
)
function notifyError(message: string) {
	notifications.add({ title: message, type: 'error' })
}

onMounted(async () => {
	try {
		const response = await api.get('/items/editor_skills', {
			params: {
				fields: ['id', 'name', 'description', 'icon', 'scopes', 'archived', 'sort'],
				filter: { archived: { _eq: false } },
				sort: ['sort', 'name'],
				limit: -1,
			},
		})
		skills.value = z.array(editorSkillMenuItemSchema).parse(response.data.data)
		emit('skillsChange', skills.value)
	} catch {
		notifyError('AI skills could not be loaded. Check your editor_skills read permission.')
	}
})

onMounted(() =>
	props.editor.view.dom.addEventListener('markdown-editor-ai-suggestion', handleSuggestionAction),
)
onBeforeUnmount(() => {
	props.editor.view.dom.removeEventListener(
		'markdown-editor-ai-suggestion',
		handleSuggestionAction,
	)
	clearPendingAiSuggestion(props.editor)
})

async function run(scope: EditorAiScope, skillId?: string) {
	if (loading.value || props.disabled) return
	const snapshot = scope === 'selection' ? captureSelection(props.editor) : undefined
	if (scope === 'selection' && !snapshot) {
		notifyError('Select some text before using AI.')
		return
	}
	const position =
		scope === 'insert'
			? (insertionPosition.value ?? props.editor.state.selection.from)
			: undefined
	loading.value = true
	menuOpen.value = false
	try {
		const content = scope === 'document' ? props.editor.getMarkdown() : snapshot?.text
		if (scope === 'document') documentSnapshot.value = content
		const requestPrompt = skillId ? undefined : prompt.value
		lastRequest.value = { scope, ...(skillId ? { skillId } : { prompt: requestPrompt }) }
		const response = await api.post('/editor/ai', {
			scope,
			...(content !== undefined ? { content } : {}),
			...(skillId ? { skillId } : { prompt: requestPrompt }),
			...(snapshot ? { selection: snapshot } : {}),
			...(position !== undefined
				? {
						insertion: {
							position,
							before: props.editor.state.doc
								.textBetween(0, position, '\n')
								.slice(-20_000),
							after: props.editor.state.doc
								.textBetween(position, props.editor.state.doc.content.size, '\n')
								.slice(0, 20_000),
						},
					}
				: {}),
			collection: props.collection,
			field: props.field,
			components: props.components?.map((component) => ({
				name: component.name,
				description: component.description,
				nodeType: component.nodeType,
				props: Object.keys(component.props),
				slots: component.slots,
			})),
		})
		if (scope === 'document') documentProposal.value = response.data.content
		else {
			selectionSnapshot.value =
				snapshot ??
				(position !== undefined ? { from: position, to: position, text: '' } : undefined)
			if (selectionSnapshot.value)
				showPendingAiSuggestion(props.editor, {
					...selectionSnapshot.value,
					content: response.data.content,
				})
		}
		promptOpen.value = false
		prompt.value = ''
	} catch (cause) {
		notifyError(cause instanceof Error ? cause.message : 'AI could not generate a suggestion.')
	} finally {
		loading.value = false
	}
}

function ask(scope: EditorAiScope) {
	requestedScope.value = scope
	if (scope === 'insert') insertionPosition.value = props.editor.state.selection.from
	prompt.value = ''
	promptOpen.value = true
	menuOpen.value = false
}
function applyDocument() {
	if (documentProposal.value === undefined) return
	if (documentSnapshot.value !== props.editor.getMarkdown()) {
		notifyError('The document changed while AI was generating. Run the action again.')
		return
	}
	emit('applyDocument', documentProposal.value)
	documentProposal.value = undefined
	documentSnapshot.value = undefined
}
function applySelection(content: string) {
	if (
		!selectionSnapshot.value ||
		!replaceSelection(props.editor, selectionSnapshot.value, content)
	) {
		notifyError('The target content changed while AI was generating. Run the action again.')
		return
	}
	clearPendingAiSuggestion(props.editor)
	selectionSnapshot.value = undefined
}

function handleSuggestionAction(event: Event) {
	if (!(event instanceof CustomEvent)) return
	if (event.detail?.action === 'cancel') {
		clearPendingAiSuggestion(props.editor)
		selectionSnapshot.value = undefined
	}
	if (event.detail?.action === 'confirm' && typeof event.detail.content === 'string')
		applySelection(event.detail.content)
	if (event.detail?.action === 'retry' && lastRequest.value) {
		const request = lastRequest.value
		if (request.scope === 'insert' && selectionSnapshot.value)
			insertionPosition.value = selectionSnapshot.value.from
		prompt.value = request.prompt ?? ''
		void run(request.scope, request.skillId)
	}
}

defineExpose({ ask, run })
</script>

<template>
	<div class="ai-controller">
		<VMenu
			v-model="menuOpen"
			placement="bottom-start"
			show-arrow
			:disabled="disabled || loading"
		>
			<template #activator="{ toggle }">
				<VButton
					icon
					small
					ghost
					:loading="loading"
					tooltip="Edit with AI"
					aria-label="Edit with AI"
					@click.stop="toggle"
				>
					<VIcon name="auto_awesome" />
				</VButton>
			</template>
			<VList>
				<VListItem
					v-for="skill in documentSkills"
					:key="skill.id"
					clickable
					:title="skill.description ?? undefined"
					@click="run('document', skill.id)"
				>
					<VListItemIcon>
						<VIcon :name="skill.icon ?? 'auto_fix_high'" />
					</VListItemIcon>
					<VListItemContent>{{ skill.name }}</VListItemContent>
				</VListItem>
				<VListItem clickable @click="ask('document')">
					<VListItemIcon>
						<VIcon name="prompt_suggestion" />
					</VListItemIcon>
					<VListItemContent>Ask AI…</VListItemContent>
				</VListItem>
			</VList>
		</VMenu>
		<VDialog v-model="promptOpen">
			<VCard>
				<VCardTitle>{{
					requestedScope === 'insert' ? 'Write with AI' : 'Ask AI'
				}}</VCardTitle>
				<VCardText>
					<VTextarea
						v-model="prompt"
						:placeholder="
							requestedScope === 'insert'
								? 'Describe what to write'
								: 'Describe how the content should change'
						"
					/>
				</VCardText>
				<VCardActions>
					<VButton secondary @click="promptOpen = false">Cancel</VButton>
					<VButton
						:disabled="!prompt.trim()"
						:loading="loading"
						@click="run(requestedScope)"
						>Generate
					</VButton>
				</VCardActions>
			</VCard>
		</VDialog>
		<VDialog :model-value="documentProposal !== undefined" persistent>
			<VCard class="ai-controller__review">
				<VCardTitle class="ai-controller__review-header">Review AI changes</VCardTitle>
				<VCardText class="ai-controller__review-body">
					<div class="ai-controller__comparison">
						<section>
							<h3>Current</h3>
							<pre><span v-for="(part, index) in comparison.base" :key="index" :class="`is-${part.kind}`">{{
								part.value }}</span></pre>
						</section>
						<section>
							<h3>AI suggestion</h3>
							<pre><span v-for="(part, index) in comparison.incoming" :key="index" :class="`is-${part.kind}`">{{
								part.value }}</span></pre>
						</section>
					</div>
				</VCardText>
				<VCardActions class="ai-controller__review-footer">
					<VButton secondary @click="documentProposal = undefined">Discard</VButton>
					<VButton @click="applyDocument">Apply changes</VButton>
				</VCardActions>
			</VCard>
		</VDialog>
	</div>
</template>

<style scoped>
.ai-controller {
	display: flex;
	align-items: center;
	padding-inline-end: 0.375rem;
}

.ai-controller__review {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	width: calc(100vw - 2rem);
	max-width: calc(100vw - 2rem);
	max-height: min(90dvh, 50rem);
	overflow: hidden;
}

@media (min-width: 769px) {
	.ai-controller__review {
		width: 75vw !important;
		max-width: 75vw !important;
	}
}

.ai-controller__comparison {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
}

.ai-controller__review-header {
	border-block-end: 1px solid var(--theme--border-color-subdued, #edf0f2);
}

.ai-controller__review-body {
	min-height: 0;
	overflow-y: auto;
}

.ai-controller__review-footer {
	border-block-start: 1px solid var(--theme--border-color-subdued, #edf0f2);
}

.ai-controller__comparison section {
	min-width: 0;
}

.ai-controller__comparison pre {
	min-height: 18rem;
	max-height: 60vh;
	overflow: auto;
	padding: 1rem;
	white-space: pre-wrap;
	background: var(--theme--background-subdued);
}

.is-added {
	background: color-mix(in srgb, var(--theme--success) 25%, transparent);
}

.is-removed {
	background: color-mix(in srgb, var(--theme--danger) 22%, transparent);
	text-decoration: line-through;
}

@media (max-width: 700px) {
	.ai-controller__comparison {
		grid-template-columns: 1fr;
	}
}
</style>
