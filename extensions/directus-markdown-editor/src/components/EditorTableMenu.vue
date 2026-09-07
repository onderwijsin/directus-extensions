<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Vue template callbacks are private component behavior. */
import type { Editor } from '@tiptap/core'
import type { EditorCommand } from '../editor/commands'

import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'

import { BubbleMenu } from '@tiptap/vue-3/menus'

import { editorTableToolbarConfig, resolveCommands } from '../editor/commands'

const props = defineProps<{
	editor: Editor
	commands: EditorCommand[]
	disabled?: boolean
}>()

const revision = shallowRef(0)
const groups = computed(() =>
	editorTableToolbarConfig.groups.map((ids) => resolveCommands(props.commands, ids)),
)

function refresh() {
	revision.value += 1
}

function isDisabled(command: EditorCommand) {
	return props.disabled || !props.editor.isEditable || command.isDisabled(props.editor)
}

function execute(command: EditorCommand) {
	if (!isDisabled(command)) command.execute(props.editor)
}

onMounted(() => props.editor.on('transaction', refresh))
onBeforeUnmount(() => props.editor.off('transaction', refresh))
</script>

<template>
	<BubbleMenu
		:editor="editor"
		plugin-key="tableBubbleMenu"
		class="editor-table-menu"
		:should-show="
			({ editor: currentEditor, view }) =>
				!disabled && view.hasFocus() && currentEditor.isActive('table')
		"
	>
		<div
			v-for="(group, groupIndex) in groups"
			:key="groupIndex"
			class="editor-table-menu__group"
		>
			<VButton
				v-for="command in group"
				:key="`${command.id}-${revision}`"
				icon
				small
				ghost
				class="editor-table-menu__button"
				:kind="command.id === 'delete-table' ? 'danger' : 'normal'"
				:active="command.isActive(editor)"
				:disabled="isDisabled(command)"
				:tooltip="command.label"
				:aria-label="command.label"
				@mousedown.prevent
				@click="execute(command)"
			>
				<VIcon :name="command.icon" />
			</VButton>
		</div>
	</BubbleMenu>
</template>

<style scoped>
.editor-table-menu {
	display: flex;
	align-items: center;
	gap: 0.125rem;
	padding: 0.25rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: calc(var(--theme--border-radius, 0.25rem) + 0.125rem);
	background: var(--theme--background, white);
	box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 12%);
}

.editor-table-menu__group {
	display: flex;
	align-items: center;
	gap: 0.125rem;
}

.editor-table-menu__group + .editor-table-menu__group {
	padding-inline-start: 0.25rem;
	border-inline-start: 1px solid var(--theme--border-color-subdued, #edf0f2);
}

.editor-table-menu__button {
	--v-button-background-color: transparent;
	--v-button-background-color-hover: var(--theme--background-normal, #eceff1);
	--v-button-color-hover: var(--theme--foreground, #1f2937);
}
</style>
