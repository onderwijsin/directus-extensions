import type { Editor } from '@tiptap/core'

import { EDITOR_AI_INSERTION_MARKER } from '../../shared/editor-ai'
import { serializeMarkdownDocument } from './markdown'

/**
 * Serialize the complete document with an explicit insertion marker.
 * @param editor Active Markdown editor.
 * @param position ProseMirror insertion position.
 * @returns Markdown document containing the insertion marker, or nothing when unavailable.
 */
export function createInsertionDocument(editor: Editor, position: number): string | undefined {
	if (!editor.markdown || position < 0 || position > editor.state.doc.content.size) return
	const markedDocument = editor.state.tr.insertText(EDITOR_AI_INSERTION_MARKER, position).doc
	return serializeMarkdownDocument(editor, markedDocument)
}
