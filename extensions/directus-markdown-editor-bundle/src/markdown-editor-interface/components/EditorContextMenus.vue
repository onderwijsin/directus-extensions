<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorAiScope, EditorSkillMenuItem } from '../ai/types'
import type { EditorCommand } from '../editor/commands'

import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import { TextSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'

import { deleteBlock, duplicateBlock, moveBlockDown, moveBlockUp } from '../editor/block'
import { isEditorToolEnabled, resolveCommands } from '../editor/commands'
import { getDragHandleOffset } from '../editor/drag-handle'

const props = defineProps<{
	editor: Editor
	commands: EditorCommand[]
	enabledTools?: string[] | null
	disabled?: boolean
	referencesEnabled?: boolean
	componentsAvailable?: boolean
	aiEnabled?: boolean
	aiSkills?: EditorSkillMenuItem[]
}>()
const emit = defineEmits<{
	openLink: []
	openComponents: []
	openReference: []
	runAi: [scope: EditorAiScope, skillId: string]
	askAi: [scope: EditorAiScope]
}>()
const revision = shallowRef(0)
const hoveredPosition = shallowRef<number | null>(null)
const insertMenuPosition = shallowRef<number | null>(null)
const blockMenuPosition = shallowRef<number | null>(null)
const insertMenuOpen = shallowRef(false)
const blockMenuOpen = shallowRef(false)
const selectionAiMenuOpen = shallowRef(false)
let dragHandleLayerTimer: number | null = null

const inlineCommands = computed(() =>
	resolveCommands(props.commands, ['bold', 'italic', 'strike', 'code']),
)
const insertCommands = computed(() =>
	resolveCommands(props.commands, [
		'paragraph',
		'heading-1',
		'heading-2',
		'heading-3',
		'bullet-list',
		'ordered-list',
		'blockquote',
		'code-block',
		'horizontal-rule',
		'insert-table',
	]),
)
const selectionAiSkills = computed(() =>
	(props.aiSkills ?? []).filter((skill) => !skill.archived && skill.scopes.includes('selection')),
)

function refresh() {
	revision.value += 1
}

onMounted(async () => {
	props.editor.on('transaction', refresh)
	await nextTick()
	dragHandleLayerTimer = window.setTimeout(lowerDragHandleLayer)
})
onBeforeUnmount(() => {
	props.editor.off('transaction', refresh)
	if (dragHandleLayerTimer !== null) window.clearTimeout(dragHandleLayerTimer)
})

function lowerDragHandleLayer() {
	const layer =
		props.editor.view.dom.parentElement?.querySelector<HTMLElement>(
			'.editor-block-controls',
		)?.parentElement
	if (layer && layer.style.zIndex !== '1') layer.style.zIndex = '1'
}

function execute(command: EditorCommand) {
	if (!props.disabled && !command.isDisabled(props.editor)) command.execute(props.editor)
}

function removeLink() {
	if (!props.disabled) props.editor.chain().focus().unsetLink().run()
}

function updateDragHandleNode(change: {
	node: ProseMirrorNode | null
	editor: Pick<Editor, 'state' | 'view'>
	pos: number
}) {
	lowerDragHandleLayer()
	hoveredPosition.value = change.node ? change.pos : null
	const rail = change.editor.view.dom
		.closest('.markdown-editor')
		?.querySelector<HTMLElement>('.editor-block-controls__rail')
	const nodeDom = change.node ? change.editor.view.nodeDOM(change.pos) : null
	if (!rail || !(nodeDom instanceof HTMLElement)) {
		rail?.style.removeProperty('transform')
		return
	}
	const offset = getDragHandleOffset({
		isTextblock: change.node?.isTextblock ?? false,
		node: nodeDom,
		rail,
	})
	if (offset === null) {
		rail.style.removeProperty('transform')
		return
	}
	rail.style.transform = `translateY(${offset}px)`
}

function selectBlock(position: number | null): boolean {
	if (props.disabled || !props.editor.isEditable) return false
	if (position === null) return false
	return props.editor.chain().focus().setNodeSelection(position).run()
}

function setInsertMenuState(open: boolean) {
	if (open) blockMenuOpen.value = false
	insertMenuOpen.value = open
	if (open) insertMenuPosition.value = hoveredPosition.value
	props.editor.commands.setMeta('lockDragHandle', insertMenuOpen.value || blockMenuOpen.value)
	if (open) selectBlock(insertMenuPosition.value)
}

function setBlockMenuState(open: boolean) {
	if (open) insertMenuOpen.value = false
	blockMenuOpen.value = open
	if (open) blockMenuPosition.value = hoveredPosition.value
	props.editor.commands.setMeta('lockDragHandle', insertMenuOpen.value || blockMenuOpen.value)
	if (open) selectBlock(blockMenuPosition.value)
}

function prepareInsertionPoint(): boolean {
	if (props.disabled || !props.editor.isEditable) return false
	const position = insertMenuPosition.value ?? hoveredPosition.value
	if (position === null) return false
	const node = props.editor.state.doc.nodeAt(position)
	if (!node) return false
	const insertAt = position + node.nodeSize
	return props.editor
		.chain()
		.focus()
		.insertContentAt(insertAt, { type: 'paragraph' })
		.setTextSelection(insertAt + 1)
		.run()
}

function insert(command: EditorCommand) {
	if (!prepareInsertionPoint()) return
	execute(command)
	setInsertMenuState(false)
}

function openComponentInsert() {
	if (!props.componentsAvailable || props.disabled || !props.editor.isEditable) return
	if (!prepareInsertionPoint()) return
	setInsertMenuState(false)
	emit('openComponents')
}

function openReferenceInsert() {
	if (!props.referencesEnabled || props.disabled || !props.editor.isEditable) return
	if (!prepareInsertionPoint()) return
	setInsertMenuState(false)
	emit('openReference')
}

function runBlockAction(action: 'duplicate' | 'up' | 'down' | 'delete') {
	const position = blockMenuPosition.value ?? hoveredPosition.value
	if (position === null || props.disabled) return
	if (action === 'duplicate') duplicateBlock(props.editor, position)
	if (action === 'up') moveBlockUp(props.editor, position)
	if (action === 'down') moveBlockDown(props.editor, position)
	if (action === 'delete') deleteBlock(props.editor, position)
	setBlockMenuState(false)
}

function runAi(skillId?: string) {
	selectionAiMenuOpen.value = false
	if (skillId) emit('runAi', 'selection', skillId)
	else emit('askAi', 'selection')
	setBlockMenuState(false)
}
</script>

<template>
	<BubbleMenu
		:editor="editor"
		class="editor-bubble-menu"
		:should-show="
			({ editor: currentEditor, state }) =>
				!disabled &&
				!insertMenuOpen &&
				!blockMenuOpen &&
				!currentEditor.isActive('table') &&
				!currentEditor.isActive('codeBlock') &&
				state.selection instanceof TextSelection &&
				!state.selection.empty
		"
	>
		<VMenu v-if="aiEnabled" v-model="selectionAiMenuOpen" placement="bottom-start" show-arrow>
			<template #activator="{ toggle }">
				<VButton
					icon
					small
					ghost
					class="editor-bubble-menu__button"
					aria-label="Edit with AI"
					:tooltip="selectionAiMenuOpen ? undefined : 'Edit with AI'"
					@mousedown.prevent
					@click.stop="toggle"
				>
					<VIcon name="auto_awesome" />
				</VButton>
			</template>
			<VList>
				<VListItem
					v-for="skill in selectionAiSkills"
					:key="skill.id"
					clickable
					@click="runAi(skill.id)"
				>
					<VListItemContent>{{ skill.name }}</VListItemContent>
				</VListItem>
				<VListItem clickable @click="runAi()">
					<VListItemContent>Ask AI…</VListItemContent>
				</VListItem>
			</VList>
		</VMenu>
		<VButton
			v-for="command in inlineCommands"
			:key="`${command.id}-${revision}`"
			icon
			small
			ghost
			class="editor-bubble-menu__button"
			:active="command.isActive(editor)"
			:disabled="disabled || !editor.isEditable || command.isDisabled(editor)"
			:tooltip="command.label"
			:aria-label="command.label"
			@mousedown.prevent
			@click="execute(command)"
		>
			<VIcon :name="command.icon" />
		</VButton>
		<VButton
			v-if="isEditorToolEnabled(enabledTools, 'link')"
			icon
			small
			ghost
			class="editor-bubble-menu__button"
			:disabled="disabled || !editor.isEditable"
			aria-label="Edit link"
			tooltip="Edit link"
			@mousedown.prevent
			@click="emit('openLink')"
		>
			<VIcon name="link" />
		</VButton>
		<VButton
			v-if="isEditorToolEnabled(enabledTools, 'link') && editor.isActive('link')"
			icon
			small
			ghost
			class="editor-bubble-menu__button"
			:disabled="disabled || !editor.isEditable"
			aria-label="Remove link"
			tooltip="Remove link"
			@mousedown.prevent
			@click="removeLink"
		>
			<VIcon name="link_off" />
		</VButton>
	</BubbleMenu>

	<DragHandle
		v-if="!disabled"
		:editor="editor"
		:compute-position-config="{ placement: 'left-start' }"
		:on-node-change="updateDragHandleNode"
		class="editor-block-controls"
	>
		<div class="editor-block-controls__rail">
			<VMenu
				:model-value="insertMenuOpen"
				placement="bottom-start"
				show-arrow
				@update:model-value="setInsertMenuState"
			>
				<template #activator>
					<VButton
						icon
						small
						ghost
						class="editor-block-controls__button"
						aria-label="Insert block"
						tooltip="Insert block"
						@mousedown.stop
						@click.stop="setInsertMenuState(!insertMenuOpen)"
					>
						<VIcon name="add" />
					</VButton>
				</template>
				<VList class="editor-block-controls__menu">
					<VListItem
						v-for="command in insertCommands"
						:key="command.id"
						clickable
						@click="insert(command)"
					>
						<VListItemIcon>
							<VIcon :name="command.icon" />
						</VListItemIcon>
						<VListItemContent>{{ command.label }}</VListItemContent>
					</VListItem>
					<VDivider
						v-if="
							(componentsAvailable &&
								isEditorToolEnabled(enabledTools, 'component')) ||
							(referencesEnabled && isEditorToolEnabled(enabledTools, 'reference'))
						"
					/>
					<VListItem
						v-if="componentsAvailable && isEditorToolEnabled(enabledTools, 'component')"
						clickable
						@click="openComponentInsert"
					>
						<VListItemIcon>
							<VIcon name="widgets" />
						</VListItemIcon>
						<VListItemContent>Component</VListItemContent>
					</VListItem>
					<VListItem
						v-if="referencesEnabled && isEditorToolEnabled(enabledTools, 'reference')"
						clickable
						@click="openReferenceInsert"
					>
						<VListItemIcon>
							<VIcon name="alternate_email" />
						</VListItemIcon>
						<VListItemContent>Reference</VListItemContent>
					</VListItem>
				</VList>
			</VMenu>

			<VMenu
				:model-value="blockMenuOpen"
				placement="bottom-start"
				show-arrow
				@update:model-value="setBlockMenuState"
			>
				<template #activator>
					<VButton
						icon
						small
						ghost
						class="editor-block-controls__button editor-block-controls__drag"
						aria-label="Drag or open block actions"
						tooltip="Drag or open block actions"
						@click.stop="setBlockMenuState(!blockMenuOpen)"
					>
						<VIcon name="drag_indicator" />
					</VButton>
				</template>
				<VList class="editor-block-controls__menu">
					<VMenu v-if="aiEnabled" placement="right-start" show-arrow>
						<template #activator="{ toggle }">
							<VListItem clickable @click.stop="toggle">
								<VListItemIcon>
									<VIcon name="auto_awesome" />
								</VListItemIcon>
								<VListItemContent>AI editing</VListItemContent>
							</VListItem>
						</template>
						<VList>
							<VListItem
								v-for="skill in selectionAiSkills"
								:key="skill.id"
								clickable
								@click="runAi(skill.id)"
							>
								<VListItemContent>{{ skill.name }}</VListItemContent>
							</VListItem>
							<VListItem clickable @click="runAi()">
								<VListItemContent>Ask AI…</VListItemContent>
							</VListItem>
						</VList>
					</VMenu>
					<VDivider v-if="aiEnabled" />
					<VListItem clickable @click="runBlockAction('duplicate')">
						<VListItemIcon>
							<VIcon name="content_copy" />
						</VListItemIcon>
						<VListItemContent>Duplicate</VListItemContent>
					</VListItem>
					<VListItem clickable @click="runBlockAction('up')">
						<VListItemIcon>
							<VIcon name="arrow_upward" />
						</VListItemIcon>
						<VListItemContent>Move up</VListItemContent>
					</VListItem>
					<VListItem clickable @click="runBlockAction('down')">
						<VListItemIcon>
							<VIcon name="arrow_downward" />
						</VListItemIcon>
						<VListItemContent>Move down</VListItemContent>
					</VListItem>
					<VDivider />
					<VListItem
						clickable
						class="editor-block-controls__danger"
						@click="runBlockAction('delete')"
					>
						<VListItemIcon>
							<VIcon name="delete" />
						</VListItemIcon>
						<VListItemContent>Delete</VListItemContent>
					</VListItem>
				</VList>
			</VMenu>
		</div>
	</DragHandle>
</template>

<style scoped>
.editor-bubble-menu {
	z-index: 2;
	display: flex;
	gap: 0.125rem;
	padding: 0.25rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background, white);
	box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 12%);
}

.editor-bubble-menu__button {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--theme--background-normal, #eceff1);
	--v-button-color-hover: var(--theme--foreground, #1f2937);
}

.editor-block-controls__rail {
	display: flex;
	align-items: center;
	gap: 0;
	opacity: 0.68;
	transition: opacity 120ms ease;
}

.editor-block-controls:hover .editor-block-controls__rail,
.editor-block-controls:focus-within .editor-block-controls__rail {
	opacity: 1;
}

.editor-block-controls__button {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--theme--background-subdued, #f0f2f5);
	--v-button-color: var(--theme--foreground-subdued, #8b98a5);
	--v-button-color-hover: var(--theme--foreground, #1f2937);
}

.editor-block-controls__drag {
	cursor: grab;
}

.editor-block-controls__drag:active {
	cursor: grabbing;
}

.editor-block-controls__menu {
	min-width: 13rem;
	max-height: 22rem;
	overflow-y: auto;
}

.editor-block-controls__danger {
	color: var(--theme--danger, #cc3a3a);
}
</style>
