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
import { captureSelection, isSelectionCurrent, replaceSelection } from '../ai/selection'

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
const selectionProposal = shallowRef<string>()
const selectionSnapshot = shallowRef<SelectionSnapshot>()
const insertionPosition = shallowRef<number>()
const selectionIsCurrent = shallowRef(false)
const selectionPanelPosition = shallowRef({ top: '0px', left: '0px' })
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

function updateSelectionPanel() {
	const snapshot = selectionSnapshot.value
	if (!snapshot) return
	selectionIsCurrent.value = isSelectionCurrent(props.editor, snapshot)
	const position = Math.min(snapshot.to, props.editor.state.doc.content.size)
	const coordinates = props.editor.view.coordsAtPos(position)
	const below = coordinates.bottom + 8
	const top = below <= window.innerHeight - 240 ? below : Math.max(8, coordinates.top - 248)
	selectionPanelPosition.value = {
		top: `${top}px`,
		left: `${Math.max(8, Math.min(coordinates.left, window.innerWidth - 464))}px`,
	}
}

onMounted(() => {
	props.editor.on('transaction', updateSelectionPanel)
	window.addEventListener('resize', updateSelectionPanel)
	window.addEventListener('scroll', updateSelectionPanel, true)
})
onBeforeUnmount(() => {
	props.editor.off('transaction', updateSelectionPanel)
	window.removeEventListener('resize', updateSelectionPanel)
	window.removeEventListener('scroll', updateSelectionPanel, true)
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
	const insertion =
		scope === 'insert' && position !== undefined
			? {
					position,
					before: props.editor.state.doc.textBetween(0, position, '\n').slice(-20_000),
					after: props.editor.state.doc
						.textBetween(position, props.editor.state.doc.content.size, '\n')
						.slice(0, 20_000),
				}
			: undefined
	loading.value = true
	menuOpen.value = false
	try {
		const content = scope === 'document' ? props.editor.getMarkdown() : snapshot?.text
		if (scope === 'document') documentSnapshot.value = content
		const requestPrompt = skillId ? undefined : prompt.value
		const response = await api.post('/editor/ai', {
			scope,
			...(content !== undefined ? { content } : {}),
			...(skillId ? { skillId } : { prompt: requestPrompt }),
			...(snapshot ? { selection: snapshot } : {}),
			...(insertion ? { insertion } : {}),
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
		if (scope === 'document') {
			documentProposal.value = response.data.content
		} else if (scope === 'selection' && snapshot) {
			selectionSnapshot.value = snapshot
			selectionProposal.value = response.data.content
			updateSelectionPanel()
		} else if (
			position === undefined ||
			!replaceSelection(
				props.editor,
				{ from: position, to: position, text: '' },
				response.data.content,
			)
		) {
			notifyError(
				'The insertion position changed while AI was generating. Run the action again.',
			)
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
function applySelection() {
	if (
		!selectionSnapshot.value ||
		selectionProposal.value === undefined ||
		!replaceSelection(props.editor, selectionSnapshot.value, selectionProposal.value)
	) {
		notifyError('The selection changed while AI was generating. Run the action again.')
		return
	}
	selectionProposal.value = undefined
	selectionSnapshot.value = undefined
}

function discardSelection() {
	selectionProposal.value = undefined
	selectionSnapshot.value = undefined
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
						autofocus
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
		<Teleport to="body">
			<div
				v-if="selectionProposal !== undefined"
				class="ai-controller__selection-review"
				:style="selectionPanelPosition"
				role="dialog"
				aria-label="Review AI suggestion"
			>
				<strong>AI suggestion</strong>
				<pre>{{ selectionProposal }}</pre>
				<p v-if="!selectionIsCurrent">The selected content has changed.</p>
				<div class="ai-controller__selection-actions">
					<VButton x-small secondary @click="discardSelection">Discard</VButton>
					<VButton x-small :disabled="!selectionIsCurrent" @click="applySelection">
						Replace
					</VButton>
				</div>
			</div>
		</Teleport>
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

.ai-controller__selection-review {
	position: fixed;
	z-index: 1000;
	width: min(28rem, calc(100vw - 1rem));
	padding: 0.75rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background, white);
	box-shadow: var(--theme--navigation--box-shadow, 0 0.5rem 1.25rem rgb(0 0 0 / 14%));
}

.ai-controller__selection-review pre {
	max-height: 12rem;
	margin-block: 0.75rem;
	overflow: auto;
	white-space: pre-wrap;
}

.ai-controller__selection-review p {
	margin-block: 0 0.75rem;
	color: var(--theme--danger, #e35169);
}

.ai-controller__selection-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.5rem;
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
