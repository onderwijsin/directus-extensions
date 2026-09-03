<script setup lang="ts">
// Directus/Vue template callbacks are intentionally local and do not need public API JSDoc.
import type { Editor } from '@tiptap/core'
import type { EditorCommand } from '../editor/commands'

import { computed, onMounted, onUnmounted, ref } from 'vue'

import DirectusButton from '../ui/DirectusButton.vue'
import DirectusIcon from '../ui/DirectusIcon.vue'
import DirectusMenu from '../ui/DirectusMenu.vue'

const props = defineProps<{
	editor: Editor
	commands: EditorCommand[]
	disabled?: boolean
}>()
const emit = defineEmits<{ openLink: []; openImage: []; openMedia: []; openSource: [] }>()

const container = ref<HTMLElement | null>(null)
const availableWidth = ref(Number.POSITIVE_INFINITY)

const visibleCount = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		if (!Number.isFinite(availableWidth.value)) return props.commands.length
		return Math.max(1, Math.floor((availableWidth.value - 44) / 38))
	},
)
const visibleCommands = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.commands.slice(0, visibleCount.value),
)
const overflowCommands = computed(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => props.commands.slice(visibleCount.value),
)

let observer: ResizeObserver | undefined
onMounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => {
		if (!container.value || typeof ResizeObserver === 'undefined') return
		observer = new ResizeObserver(
			/**
			 * Editor callback.
			 * @param entries Parameter value.
			 * @returns Callback result.
			 */
			(entries) => {
				const [entry] = entries
				if (entry) availableWidth.value = entry.contentRect.width
			},
		)
		observer.observe(container.value)
	},
)
onUnmounted(
	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	() => observer?.disconnect(),
)

/**
 * Editor callback.
 * @param command Parameter value.
 * @returns Callback result.
 */
function isDisabled(command: EditorCommand) {
	return props.disabled || !props.editor.isEditable || command.isDisabled(props.editor)
}

/**
 * Editor callback.
 * @param command Parameter value.
 * @returns Callback result.
 */
function execute(command: EditorCommand) {
	if (isDisabled(command)) return
	command.execute(props.editor)
}

/**
 * Editor callback.
 * @param command Parameter value.
 * @returns Callback result.
 */
function shortcut(command: EditorCommand) {
	return command.shortcut?.replace('Mod', '⌘/Ctrl')
}
</script>

<template>
	<div ref="container" class="editor-toolbar" role="toolbar" aria-label="Text formatting">
		<div class="editor-toolbar__main">
			<DirectusButton
				v-for="command in visibleCommands"
				:key="command.id"
				:active="command.isActive(editor)"
				:disabled="isDisabled(command)"
				:tooltip="[command.label, shortcut(command)].filter(Boolean).join(' · ')"
				:aria-label="command.label"
				@click="execute(command)"
			>
				<template #icon><DirectusIcon :name="command.icon" /></template>
			</DirectusButton>
			<DirectusButton
				:disabled="disabled || !editor.isEditable"
				tooltip="Edit link · ⌘/Ctrl-K"
				aria-label="Edit link"
				@click="emit('openLink')"
			>
				<template #icon><DirectusIcon name="link" /></template>
			</DirectusButton>
			<DirectusButton
				tooltip="Insert image"
				aria-label="Insert image"
				@click="emit('openImage')"
			>
				<template #icon><DirectusIcon name="image" /></template>
			</DirectusButton>
			<DirectusButton
				tooltip="Insert video"
				aria-label="Insert video"
				@click="emit('openMedia')"
			>
				<template #icon><DirectusIcon name="movie" /></template>
			</DirectusButton>
			<DirectusButton
				tooltip="Edit Markdown source"
				aria-label="Edit Markdown source"
				@click="emit('openSource')"
			>
				<template #icon><DirectusIcon name="code" /></template>
			</DirectusButton>
		</div>

		<DirectusMenu v-if="overflowCommands.length" class="editor-toolbar__overflow">
			<template #activator="{ toggle }">
				<DirectusButton
					:disabled="disabled || !editor.isEditable"
					:tooltip="'More formatting'"
					aria-label="More formatting"
					@click.stop="toggle"
				>
					<template #icon><DirectusIcon name="more_horiz" /></template>
				</DirectusButton>
			</template>
			<div class="editor-toolbar__menu">
				<DirectusButton
					v-for="command in overflowCommands"
					:key="command.id"
					:label="command.label"
					:active="command.isActive(editor)"
					:disabled="isDisabled(command)"
					@click="execute(command)"
				/>
			</div>
		</DirectusMenu>
	</div>
</template>

<style scoped>
.editor-toolbar {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	min-width: 0;
	padding: 0.25rem;
	border-block-end: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	background: var(--theme--form--field--input--background-subdued, #f5f7f8);
}

.editor-toolbar__main {
	display: flex;
	flex: 1 1 auto;
	align-items: center;
	gap: 0.125rem;
	min-width: 0;
	overflow: hidden;
}

.editor-toolbar__overflow {
	flex: 0 0 auto;
}

.editor-toolbar__menu {
	display: grid;
	gap: 0.125rem;
	padding: 0.25rem;
}
</style>
