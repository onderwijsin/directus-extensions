import type { Editor } from '@tiptap/core'
import type { SelectionSnapshot } from './types'

/**
 * Capture a non-empty ProseMirror selection for an asynchronous transformation.
 * @param editor Active editor instance.
 * @returns Selection snapshot or nothing for an empty selection.
 */
export function captureSelection(editor: Editor): SelectionSnapshot | undefined {
	const { from, to } = editor.state.selection
	if (from >= to) return undefined
	const text = editor.state.doc.textBetween(from, to, '\n')
	return text ? { from, to, text } : undefined
}

/**
 * Check that a captured range still contains exactly the content sent to AI.
 * @param editor Active editor instance.
 * @param snapshot Previously captured selection.
 * @returns Whether the selection range remains current.
 */
export function isSelectionCurrent(editor: Editor, snapshot: SelectionSnapshot): boolean {
	return (
		snapshot.to <= editor.state.doc.content.size &&
		editor.state.doc.textBetween(snapshot.from, snapshot.to, '\n') === snapshot.text
	)
}

/**
 * Replace a current selection snapshot in one editor transaction.
 * @param editor Active editor instance.
 * @param snapshot Previously captured selection.
 * @param content Replacement Markdown.
 * @returns Whether the replacement was applied.
 */
export function replaceSelection(
	editor: Editor,
	snapshot: SelectionSnapshot,
	content: string,
): boolean {
	if (!isSelectionCurrent(editor, snapshot)) return false
	const markdown = editor.markdown
	if (!markdown) return false
	const parsed = markdown.parse(content)
	const first = parsed.content?.[0]
	const replacement =
		parsed.content?.length === 1 && first?.type === 'paragraph'
			? (first.content ?? [])
			: (parsed.content ?? [])
	return editor.commands.insertContentAt({ from: snapshot.from, to: snapshot.to }, replacement)
}
