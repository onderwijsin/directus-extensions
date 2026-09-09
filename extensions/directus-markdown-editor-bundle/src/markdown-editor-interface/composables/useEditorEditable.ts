import type { Editor } from '@tiptap/core'

import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

/**
 * Track Tiptap editability inside Vue node views, including option-only changes.
 * @param editor Editor whose editable state should be tracked.
 * @returns A readonly reactive editable-state reference.
 */
export function useEditorEditable(editor: Editor) {
	const editable = shallowRef(editor.isEditable)

	/** @returns Nothing. */
	function refresh() {
		editable.value = editor.isEditable
	}

	onMounted(() => {
		editor.on('update', refresh)
		editor.on('transaction', refresh)
		refresh()
	})
	onBeforeUnmount(() => {
		editor.off('update', refresh)
		editor.off('transaction', refresh)
	})

	return readonly(editable)
}
