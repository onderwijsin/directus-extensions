import type { Editor } from '@tiptap/core'

/**
 * Replace editor Markdown received from Directus while preserving a valid cursor position.
 *
 * Directus can refresh an interface value without remounting it. Replacing the ProseMirror
 * document resets its selection, so the previous cursor is restored when that position still
 * exists and clamped when the incoming document is shorter.
 *
 * @param editor Active editor receiving an external value.
 * @param markdown Canonical Markdown supplied by Directus.
 * @returns Whether the document was replaced.
 */
export function synchronizeEditorMarkdown(editor: Editor, markdown: string): boolean {
	if (markdown === editor.getMarkdown()) return false

	const cursor = editor.state.selection.from
	const updated = editor.commands.setContent(markdown, {
		contentType: 'markdown',
		emitUpdate: false,
	})
	if (!updated) return false

	// Text selections live inside the document's outer node, never on its closing boundary.
	const lastTextPosition = Math.max(1, editor.state.doc.content.size - 1)
	const restoredCursor = Math.min(cursor, lastTextPosition)
	editor.commands.setTextSelection(restoredCursor)
	return true
}
