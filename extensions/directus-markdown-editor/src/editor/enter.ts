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
			 * Split the current block without preserving inline marks.
			 * @returns Whether the block was split.
			 */ () => this.editor.commands.splitBlock({ keepMarks: false }),
		}
	},
})
