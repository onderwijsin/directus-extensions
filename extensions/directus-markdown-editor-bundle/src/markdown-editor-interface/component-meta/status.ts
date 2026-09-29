import type { Editor } from '@tiptap/core'
import type { ComponentIntegrityState } from './freshness'

const states = new WeakMap<Editor, Map<number, ComponentIntegrityState>>()

/**
 * Store the latest component integrity states.
 * @param editor Editor owning the document.
 * @param value States keyed by document position.
 * @returns Nothing.
 */
export function setEditorComponentStates(
	editor: Editor,
	value: Map<number, ComponentIntegrityState>,
) {
	states.set(editor, value)
}

/**
 * Read the latest component integrity state.
 * @param editor Editor owning the document.
 * @param position Component document position.
 * @returns Current state, when the component needs attention.
 */
export function getEditorComponentState(editor: Editor, position: number) {
	return states.get(editor)?.get(position)
}
