<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { EditorCommand } from '../editor/commands'

import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

import {
	editorToolbarConfig,
	isCodeBlockToolDisabled,
	isEditorToolEnabled,
	resolveCommands,
} from '../editor/commands'

const props = defineProps<{
	editor: Editor
	commands: EditorCommand[]
	enabledTools?: string[] | null
	disabled?: boolean
	fullscreen?: boolean
}>()
const emit = defineEmits<{
	openLink: []
	openImage: []
	openMedia: []
	openSource: []
	openComponents: []
	toggleFullscreen: []
}>()

const revision = shallowRef(0)
const overflowOpen = shallowRef(false)
const blockCommands = computed(() =>
	resolveCommands(props.commands, editorToolbarConfig.blockTypeCommandIds),
)
const actionCommands = computed(() =>
	resolveCommands(props.commands, editorToolbarConfig.groups.flat()),
)
const overflowCommands = computed(() =>
	resolveCommands(props.commands, editorToolbarConfig.overflowCommandIds),
)
const specialCommands = computed(() =>
	resolveCommands(props.commands, editorToolbarConfig.specialCommandIds),
)
const linkEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'link'))
const imageEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'image'))
const videoEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'video'))
const componentsEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'component'))
const sourceEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'source'))
const fullscreenEnabled = computed(() => isEditorToolEnabled(props.enabledTools, 'fullscreen'))
const activeBlockCommand = computed(() => {
	void revision.value
	return (
		blockCommands.value.find((command) => command.isActive(props.editor)) ??
		blockCommands.value[0]
	)
})
const blockItems = computed(() =>
	blockCommands.value.map((command) => ({ text: command.label, value: command.id })),
)

function refresh() {
	revision.value += 1
}

onMounted(() => props.editor.on('transaction', refresh))
onBeforeUnmount(() => props.editor.off('transaction', refresh))
watch(
	() => props.disabled,
	/**
	 * Close the overflow menu when Directus locks the interface.
	 * @param disabled Whether the interface is locked.
	 * @returns Nothing.
	 */
	(disabled) => {
		if (disabled) overflowOpen.value = false
	},
)

function isDisabled(command: EditorCommand) {
	return props.disabled || command.isDisabled(props.editor)
}

function isToolDisabled(toolId: string) {
	void revision.value
	return props.disabled || isCodeBlockToolDisabled(props.editor, toolId)
}

function openLink() {
	if (!isToolDisabled('link')) emit('openLink')
}

function openImage() {
	if (!isToolDisabled('image')) emit('openImage')
}

function openVideo() {
	if (!isToolDisabled('video')) emit('openMedia')
}

function openComponents() {
	if (!isToolDisabled('component')) emit('openComponents')
}

function openSource() {
	if (!isDisabledForEditing()) emit('openSource')
}

function isDisabledForEditing() {
	return props.disabled
}

function execute(command: EditorCommand) {
	if (!isDisabled(command)) command.execute(props.editor)
}

function executeOverflow(command: EditorCommand) {
	execute(command)
	overflowOpen.value = false
}

function selectBlockType(id: string) {
	const selected = blockCommands.value.find((command) => command.id === id)
	if (selected) execute(selected)
}

function shortcut(command: EditorCommand) {
	return command.shortcut?.replace('Mod', '⌘/Ctrl')
}

function tooltip(command: EditorCommand) {
	return [command.label, shortcut(command)].filter(Boolean).join(' · ')
}
</script>

<template>
	<div class="editor-toolbar" role="toolbar" aria-label="Text formatting">
		<VSelect
			class="editor-toolbar__block-select"
			inline
			label
			:items="blockItems"
			:model-value="activeBlockCommand?.id"
			:disabled="disabled"
			aria-label="Block type"
			@update:model-value="selectBlockType"
		/>

		<div class="editor-toolbar__group editor-toolbar__action-group">
			<VButton
				v-for="command in actionCommands"
				:key="`${command.id}-${revision}`"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:active="command.isActive(editor)"
				:disabled="isDisabled(command)"
				:tooltip="tooltip(command)"
				:aria-label="command.label"
				@click="execute(command)"
			>
				<VIcon :name="command.icon" />
			</VButton>
			<VButton
				v-if="linkEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isToolDisabled('link')"
				tooltip="Edit link · ⌘/Ctrl-K"
				aria-label="Edit link"
				@click="openLink"
				><VIcon name="link"
			/></VButton>
			<VButton
				v-if="imageEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isToolDisabled('image')"
				tooltip="Insert image"
				aria-label="Insert image"
				@click="openImage"
				><VIcon name="image"
			/></VButton>
			<VButton
				v-if="videoEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isToolDisabled('video')"
				tooltip="Insert video"
				aria-label="Insert video"
				@click="openVideo"
				><VIcon name="movie"
			/></VButton>
			<VMenu
				v-if="overflowCommands.length"
				v-model="overflowOpen"
				placement="bottom-end"
				show-arrow
				:disabled="disabled"
			>
				<template #activator="{ toggle }">
					<VButton
						icon
						small
						ghost
						class="editor-toolbar__ghost-button"
						:active="overflowOpen"
						:disabled="isDisabledForEditing()"
						tooltip="More editor actions"
						aria-label="More editor actions"
						@click.stop="toggle"
						><VIcon name="more_horiz"
					/></VButton>
				</template>
				<VList class="editor-toolbar__overflow-list">
					<VListItem
						v-for="command in overflowCommands"
						:key="`${command.id}-${revision}`"
						clickable
						:disabled="isDisabled(command)"
						:active="command.isActive(editor)"
						@click="executeOverflow(command)"
					>
						<VListItemIcon><VIcon :name="command.icon" /></VListItemIcon>
						<VListItemContent>{{ command.label }}</VListItemContent>
					</VListItem>
				</VList>
			</VMenu>
		</div>

		<div class="editor-toolbar__spacer" aria-hidden="true" />

		<div class="editor-toolbar__group editor-toolbar__special-group">
			<VButton
				v-for="command in specialCommands"
				:key="`${command.id}-${revision}`"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isDisabled(command)"
				:tooltip="tooltip(command)"
				:aria-label="command.label"
				@click="execute(command)"
			>
				<VIcon :name="command.icon" />
			</VButton>
			<VButton
				v-if="componentsEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isToolDisabled('component')"
				tooltip="Insert component"
				aria-label="Insert component"
				@click="openComponents"
				><VIcon name="widgets"
			/></VButton>
			<VButton
				v-if="sourceEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:disabled="isDisabledForEditing()"
				tooltip="Edit Markdown source"
				aria-label="Edit Markdown source"
				@click="openSource"
				><VIcon name="code"
			/></VButton>
			<VButton
				v-if="fullscreenEnabled"
				icon
				small
				ghost
				class="editor-toolbar__ghost-button"
				:active="fullscreen"
				:disabled="isDisabledForEditing()"
				:tooltip="fullscreen ? 'Exit full screen' : 'Full screen'"
				:aria-label="fullscreen ? 'Exit full screen' : 'Full screen'"
				:aria-pressed="fullscreen"
				@click="emit('toggleFullscreen')"
				><VIcon :name="fullscreen ? 'fullscreen_exit' : 'fullscreen'"
			/></VButton>
		</div>
	</div>
</template>

<style scoped>
.editor-toolbar {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.375rem;
	overflow-x: auto;
	background: var(--theme--form--field--input--background-subdued, #f5f7f8);
}

.editor-toolbar__block-select {
	flex: 0 0 auto;
	min-width: 0;
	max-width: 8rem;
}

.editor-toolbar__group {
	display: flex;
	align-items: center;
	gap: 0.125rem;
	padding-inline-start: 0.25rem;
	border-inline-start: 1px solid var(--theme--border-color, #d3dce3);
}

.editor-toolbar__spacer {
	flex: 1 1 2rem;
}

.editor-toolbar__special-group {
	padding-inline-start: 0.375rem;
}

.editor-toolbar__ghost-button {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--theme--background-normal, #eceff1);
	--v-button-color-hover: var(--theme--foreground, #1f2937);
}

.editor-toolbar__overflow-list {
	min-width: 14rem;
}

@media (max-width: 48rem) {
	.editor-toolbar__block-select {
		max-width: 7rem;
	}

	.editor-toolbar__spacer {
		flex-basis: 0.5rem;
	}
}
</style>
