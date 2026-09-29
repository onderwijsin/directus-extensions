import type { Editor } from '@tiptap/core'

import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Exit an MDC slot when Enter is pressed in its trailing empty paragraph.
 * @param editor Active Tiptap editor.
 * @returns Whether the cursor was moved below the containing component.
 */
function exitMdcSlot(editor: Editor): boolean {
	const { $from, empty } = editor.state.selection
	if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size > 0)
		return false
	const slotDepth = $from.depth - 1
	const blockDepth = slotDepth - 1
	if (
		slotDepth < 1 ||
		blockDepth < 1 ||
		$from.node(slotDepth).type.name !== 'mdcSlot' ||
		$from.node(blockDepth).type.name !== 'mdcBlock'
	) {
		return false
	}

	const componentEnd = $from.after(blockDepth)
	return editor.commands.command(({ dispatch, tr }) => {
		let insertionPosition = componentEnd
		const slot = $from.node(slotDepth)
		if (slot.childCount > 1) {
			const paragraphStart = $from.before()
			tr.delete(paragraphStart, paragraphStart + $from.parent.nodeSize)
			insertionPosition = tr.mapping.map(componentEnd, -1)
		}
		const nextNode = tr.doc.nodeAt(insertionPosition)
		const nextIsEmptyParagraph =
			nextNode?.type.name === 'paragraph' && nextNode.content.size === 0
		if (!nextIsEmptyParagraph) {
			const paragraph = editor.schema.nodes.paragraph?.create()
			if (!paragraph) return false
			tr.insert(insertionPosition, paragraph)
		}
		tr.setSelection(TextSelection.create(tr.doc, insertionPosition + 1))
		dispatch?.(tr)
		return true
	})
}

/** Start every new text block without carrying inline formatting forward. */
export const ClearMarksOnEnter = Extension.create({
	name: 'clearMarksOnEnter',

	/**
	 * Register the custom Enter behavior.
	 * @returns Keyboard shortcut handlers.
	 */
	addKeyboardShortcuts() {
		return {
			Enter: /**
			 * Preserve Tiptap's block, list, and code Enter behavior while clearing
			 * inline marks on a newly created text block.
			 * @returns Whether the block was split.
			 */ () => {
				if (exitMdcSlot(this.editor)) return true
				return this.editor.commands.first(({ commands }) => [
					() => commands.newlineInCode(),
					() => commands.createParagraphNear(),
					() => commands.splitListItem('listItem'),
					() => commands.liftEmptyBlock(),
					() => commands.splitBlock({ keepMarks: false }),
				])
			},
		}
	},
})
