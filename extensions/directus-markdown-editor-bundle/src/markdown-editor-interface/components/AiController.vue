<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { EditorAiScope, EditorSkillMenuItem, SelectionSnapshot } from '../ai/types'
import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onMounted, shallowRef } from 'vue'

import { useApi } from '@directus/extensions-sdk'
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
const error = shallowRef<string>()
const comparison = computed(() =>
	diffMarkdown(documentSnapshot.value ?? props.value, documentProposal.value ?? props.value),
)
const documentSkills = computed(() =>
	skills.value.filter((skill) => !skill.archived && skill.scopes.includes('document')),
)
const selectionIsCurrent = computed(() =>
	selectionSnapshot.value ? isSelectionCurrent(props.editor, selectionSnapshot.value) : false,
)

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
		error.value = 'AI skills could not be loaded. Check your editor_skills read permission.'
	}
})

async function run(scope: EditorAiScope, skillId?: string) {
	if (loading.value || props.disabled) return
	const snapshot = scope === 'selection' ? captureSelection(props.editor) : undefined
	if (scope === 'selection' && !snapshot) {
		error.value = 'Select some text before using AI.'
		return
	}
	loading.value = true
	error.value = undefined
	menuOpen.value = false
	try {
		const content = scope === 'document' ? props.editor.getMarkdown() : (snapshot?.text ?? '')
		if (scope === 'document') documentSnapshot.value = content
		const response = await api.post('/editor/ai', {
			scope,
			content,
			...(skillId ? { skillId } : { prompt: prompt.value }),
			...(snapshot ? { selection: snapshot } : {}),
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
			selectionSnapshot.value = snapshot
			selectionProposal.value = response.data.content
		}
		promptOpen.value = false
		prompt.value = ''
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : 'AI could not generate a suggestion.'
	} finally {
		loading.value = false
	}
}

function ask(scope: EditorAiScope) {
	requestedScope.value = scope
	prompt.value = ''
	promptOpen.value = true
	menuOpen.value = false
}
function applyDocument() {
	if (documentProposal.value === undefined) return
	if (documentSnapshot.value !== props.editor.getMarkdown()) {
		error.value = 'The document changed while AI was generating. Run the action again.'
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
		error.value = 'The selection changed while AI was generating. Run the action again.'
		return
	}
	selectionProposal.value = undefined
	selectionSnapshot.value = undefined
}

defineExpose({ ask, run })
</script>

<template>
	<div class="ai-controller">
		<VMenu v-model="menuOpen" placement="bottom-end" show-arrow :disabled="disabled || loading">
			<template #activator="{ toggle }"
				><VButton
					icon
					small
					ghost
					:loading="loading"
					tooltip="AI editing"
					aria-label="AI editing"
					@click.stop="toggle"
					><VIcon name="auto_awesome" /></VButton
			></template>
			<VList>
				<VListItem
					v-for="skill in documentSkills"
					:key="skill.id"
					clickable
					:title="skill.description ?? undefined"
					@click="run('document', skill.id)"
					><VListItemIcon><VIcon :name="skill.icon ?? 'auto_fix_high'" /></VListItemIcon
					><VListItemContent>{{ skill.name }}</VListItemContent></VListItem
				>
				<VListItem clickable @click="ask('document')"
					><VListItemIcon><VIcon name="prompt_suggestion" /></VListItemIcon
					><VListItemContent>Ask AI…</VListItemContent></VListItem
				>
			</VList>
		</VMenu>
		<p v-if="error" class="ai-controller__error" role="alert">{{ error }}</p>

		<VDialog v-model="promptOpen"
			><VCard
				><VCardTitle>Ask AI</VCardTitle
				><VCardText
					><VTextarea
						v-model="prompt"
						placeholder="Describe how the content should change" /></VCardText
				><VCardActions
					><VButton secondary @click="promptOpen = false">Cancel</VButton
					><VButton
						:disabled="!prompt.trim()"
						:loading="loading"
						@click="run(requestedScope)"
						>Generate</VButton
					></VCardActions
				></VCard
			></VDialog
		>
		<VDialog :model-value="documentProposal !== undefined" persistent
			><VCard class="ai-controller__review"
				><VCardTitle>Review AI changes</VCardTitle
				><VCardText
					><div class="ai-controller__comparison">
						<section>
							<h3>Current</h3>
							<pre><span v-for="(part, index) in comparison.base" :key="index" :class="`is-${part.kind}`">{{ part.value }}</span></pre>
						</section>
						<section>
							<h3>AI suggestion</h3>
							<pre><span v-for="(part, index) in comparison.incoming" :key="index" :class="`is-${part.kind}`">{{ part.value }}</span></pre>
						</section>
					</div></VCardText
				><VCardActions
					><VButton secondary @click="documentProposal = undefined">Discard</VButton
					><VButton @click="applyDocument">Apply changes</VButton></VCardActions
				></VCard
			></VDialog
		>
		<div v-if="selectionProposal !== undefined" class="ai-controller__preview-container">
			<div class="ai-controller__preview">
				<strong>AI suggestion</strong>
				<pre>{{ selectionProposal }}</pre>
				<p v-if="!selectionIsCurrent">The selection changed while AI was generating.</p>
				<div>
					<VButton x-small secondary @click="selectionProposal = undefined"
						>Discard</VButton
					><VButton x-small :disabled="!selectionIsCurrent" @click="applySelection"
						>Replace</VButton
					>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ai-controller {
	display: flex;
	align-items: center;
	padding-inline-end: 0.375rem;
}
.ai-controller__error {
	position: absolute;
	inset-inline: 0;
	top: 100%;
	z-index: 8;
	margin: 0;
	padding: 0.5rem 1rem;
	color: var(--theme--danger);
	background: var(--theme--background);
}
.ai-controller__preview {
	padding: 0.5rem;
	border: 1px solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
	background: var(--theme--background);
	box-shadow: var(--theme--navigation--box-shadow);
}
.ai-controller__preview-container {
	position: absolute;
	z-index: 7;
	inset-inline-start: 1rem;
	top: calc(100% + 0.5rem);
}
.ai-controller__preview {
	width: min(28rem, 80vw);
}
.ai-controller__preview pre {
	max-height: 12rem;
	overflow: auto;
	white-space: pre-wrap;
}
.ai-controller__review {
	width: min(72rem, 92vw);
}
.ai-controller__comparison {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
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
