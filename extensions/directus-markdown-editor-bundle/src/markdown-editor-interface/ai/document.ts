import type { Editor } from '@tiptap/core'

/**
 * Replace a complete Markdown document in one editor transaction.
 * @param editor Active editor instance.
 * @param content Reviewed replacement Markdown.
 * @returns Whether the replacement was applied.
 */
export function replaceDocument(editor: Editor, content: string): boolean {
	const markdown = editor.markdown
	if (!markdown) return false
	const replacement = editor.schema.nodeFromJSON(markdown.parse(content))
	const transaction = editor.state.tr
		.replaceWith(0, editor.state.doc.content.size, replacement.content)
		.setMeta('addToHistory', true)
	editor.view.dispatch(transaction)
	return true
}
