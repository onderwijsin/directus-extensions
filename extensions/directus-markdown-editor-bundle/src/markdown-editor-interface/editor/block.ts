import type { Editor } from '@tiptap/core'

import { NodeSelection } from '@tiptap/pm/state'

/**
 * Duplicate the top-level block at a document position.
 * @param editor Active Tiptap editor.
 * @param position Position at the start of the block.
 * @returns Whether a block was duplicated.
 */
export function duplicateBlock(editor: Editor, position: number): boolean {
	const node = editor.state.doc.nodeAt(position)
	if (!node) return false
	editor.view.dispatch(editor.state.tr.insert(position + node.nodeSize, node).scrollIntoView())
	return true
}

/**
 * Move the top-level block at a document position one sibling earlier.
 * @param editor Active Tiptap editor.
 * @param position Position at the start of the block.
 * @returns Whether the block was moved.
 */
export function moveBlockUp(editor: Editor, position: number): boolean {
	const node = editor.state.doc.nodeAt(position)
	const previous = editor.state.doc.resolve(position).nodeBefore
	if (!node || !previous) return false
	const target = position - previous.nodeSize
	const transaction = editor.state.tr
		.delete(position, position + node.nodeSize)
		.insert(target, node)
	transaction.setSelection(NodeSelection.create(transaction.doc, target))
	editor.view.dispatch(transaction.scrollIntoView())
	editor.view.focus()
	return true
}

/**
 * Move the top-level block at a document position one sibling later.
 * @param editor Active Tiptap editor.
 * @param position Position at the start of the block.
 * @returns Whether the block was moved.
 */
export function moveBlockDown(editor: Editor, position: number): boolean {
	const node = editor.state.doc.nodeAt(position)
	const next = node ? editor.state.doc.nodeAt(position + node.nodeSize) : null
	if (!node || !next) return false
	const target = position + next.nodeSize
	const transaction = editor.state.tr
		.delete(position, position + node.nodeSize)
		.insert(target, node)
	transaction.setSelection(NodeSelection.create(transaction.doc, target))
	editor.view.dispatch(transaction.scrollIntoView())
	editor.view.focus()
	return true
}

/**
 * Delete the top-level block at a document position.
 * @param editor Active Tiptap editor.
 * @param position Position at the start of the block.
 * @returns Whether the block was deleted.
 */
export function deleteBlock(editor: Editor, position: number): boolean {
	const node = editor.state.doc.nodeAt(position)
	if (!node) return false
	editor.view.dispatch(
		editor.state.tr.delete(position, position + node.nodeSize).scrollIntoView(),
	)
	return true
}
