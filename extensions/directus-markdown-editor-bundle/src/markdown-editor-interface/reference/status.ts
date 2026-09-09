import type { Editor } from '@tiptap/core'
import type { ReferenceIntegrityState, ReferenceOccurrence } from './editor'

const editorReferenceStates = new WeakMap<Editor, Map<number, ReferenceIntegrityState>>()

/**
 * Store live, non-persisted Reference integrity states for one editor.
 * @param editor Editor that owns the Reference nodes.
 * @param occurrences Latest integrity scan occurrences.
 * @returns Nothing.
 */
export function setEditorReferenceStates(editor: Editor, occurrences: ReferenceOccurrence[]): void {
	editorReferenceStates.set(
		editor,
		new Map(occurrences.map((occurrence) => [occurrence.position, occurrence.state])),
	)
}

/**
 * Read a live Reference integrity state for a node position.
 * @param editor Editor that owns the Reference node.
 * @param position Current Reference node position.
 * @returns Latest integrity state when the node has been scanned.
 */
export function getEditorReferenceState(
	editor: Editor,
	position: number,
): ReferenceIntegrityState | undefined {
	return editorReferenceStates.get(editor)?.get(position)
}
