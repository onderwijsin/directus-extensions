<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorCommand } from '../editor/commands'

import { onBeforeUnmount, onMounted, ref } from 'vue'

import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
// Contextual menus intentionally reuse the same command objects as the fixed toolbar.
import { BubbleMenu } from '@tiptap/vue-3/menus'

import DirectusButton from '../ui/DirectusButton.vue'
import DirectusIcon from '../ui/DirectusIcon.vue'

const props = defineProps<{ editor: Editor; commands: EditorCommand[]; disabled?: boolean }>()
const emit = defineEmits<{ openLink: [] }>()
const revision = ref(0)
let dragHandleNode: { node: ProseMirrorNode; pos: number } | null = null
const contextualCommands =
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() =>
		props.commands.filter(
			/**
			 * Editor callback.
			 * @param command Parameter value.
			 * @returns Callback result.
			 */
			(command) => ['bold', 'italic', 'strike', 'code'].includes(command.id),
		)
const inlineCommands =
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() =>
		contextualCommands().filter(
			/**
			 * Editor callback.
			 * @param command Parameter value.
			 * @returns Callback result.
			 */
			(command) => ['bold', 'italic', 'strike', 'code'].includes(command.id),
		)
const refresh =
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		revision.value += 1
	}
const execute =
	/**
	 * Editor callback.
	 * @param command Parameter value.
	 * @returns Callback result.
	 */
	(command: EditorCommand) => {
		if (!command.isDisabled(props.editor) && !props.disabled) command.execute(props.editor)
	}

/**
 * Remove the link mark from the current selection.
 * @returns Nothing.
 */
function removeLink() {
	if (props.disabled) return
	props.editor.chain().focus().unsetLink().run()
}

onMounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.editor.on('transaction', refresh),
)
onBeforeUnmount(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.editor.off('transaction', refresh),
)

/**
 * Track the hovered node so MDC handles can use a top-offset reference point.
 * @param nodeChange Tiptap's hovered-node event.
 * @returns Nothing.
 */
function updateDragHandleNode(nodeChange: {
	node: ProseMirrorNode | null
	editor: Pick<Editor, 'state' | 'view'>
	pos: number
}) {
	const { node, editor } = nodeChange
	const domNode = node ? editor.view.nodeDOM(nodeChange.pos) : null
	const isMdcNode =
		node?.type.name.startsWith('mdc') ||
		(domNode instanceof HTMLElement && domNode.closest('[data-mdc-node-view]') !== null)
	if (!isMdcNode) {
		dragHandleNode = null
		return
	}
	dragHandleNode = node ? { node, pos: nodeChange.pos } : null
}

/**
 * Return a virtual reference that places MDC handles one rem below the node top.
 * @returns The virtual reference for an MDC node, or null for regular nodes.
 */
function getDragHandleReference() {
	if (!dragHandleNode) return null
	const domNode = props.editor.view.nodeDOM(dragHandleNode.pos)
	if (!(domNode instanceof HTMLElement)) return null
	const rect = domNode.getBoundingClientRect()
	const handleHalfHeight = 12
	const top = rect.top + 16 + handleHalfHeight
	return {
		/**
		 * Return the virtual reference bounds.
		 * @returns The reference rectangle.
		 */
		getBoundingClientRect: () => new DOMRect(rect.left, top, 0, 0),
	}
}
</script>

<template>
	<BubbleMenu
		:editor="editor"
		class="markdown-editor__bubble-menu"
		:should-show="({ state }) => !disabled && !state.selection.empty"
	>
		<div class="markdown-editor__menu-group">
			<DirectusButton
				v-for="command in inlineCommands()"
				:key="`${command.id}-${revision}`"
				:active="command.isActive(editor)"
				:disabled="command.isDisabled(editor) || disabled"
				:aria-label="command.label"
				:tooltip="command.label"
				@mousedown.prevent
				@click="execute(command)"
			>
				<template #icon><DirectusIcon :name="command.icon" /></template>
			</DirectusButton>
			<DirectusButton
				:disabled="disabled || !editor.isEditable"
				aria-label="Insert link"
				tooltip="Insert link"
				@mousedown.prevent
				@click="emit('openLink')"
			>
				<template #icon><DirectusIcon name="link" /></template>
			</DirectusButton>
			<DirectusButton
				v-if="editor.isActive('link')"
				:disabled="disabled || !editor.isEditable"
				aria-label="Remove link"
				tooltip="Remove link"
				@mousedown.prevent
				@click="removeLink"
			>
				<template #icon><DirectusIcon name="link_off" /></template>
			</DirectusButton>
		</div>
	</BubbleMenu>

	<DragHandle
		v-if="!disabled"
		:editor="editor"
		:compute-position-config="{ placement: 'left' }"
		:get-referenced-virtual-element="getDragHandleReference"
		:on-node-change="updateDragHandleNode"
		class="markdown-editor__drag-handle"
	>
		<DirectusIcon name="drag_indicator" />
	</DragHandle>
</template>

<style scoped>
.markdown-editor__menu-group {
	display: flex;
	gap: 0.125rem;
	padding: 0.25rem;
	border: 1px solid var(--theme--border-color, #d3dce3);
	border-radius: var(--theme--border-radius, 0.25rem);
	background: var(--theme--background, white);
	box-shadow: 0 0.35rem 1rem rgb(0 0 0 / 12%);
}

.markdown-editor__drag-handle {
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	color: var(--theme--foreground-subdued, #8b98a5);
	border-radius: 0.25rem;
	cursor: grab;
}
</style>
