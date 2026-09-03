import { Extension } from '@tiptap/core'

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
			 */ () =>
				this.editor.commands.first(({ commands }) => [
					() => commands.newlineInCode(),
					() => commands.createParagraphNear(),
					() => commands.splitListItem('listItem'),
					() => commands.liftEmptyBlock(),
					() => commands.splitBlock({ keepMarks: false }),
				]),
		}
	},
})
