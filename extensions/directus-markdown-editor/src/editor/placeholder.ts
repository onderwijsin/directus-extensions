// ProseMirror plugin callbacks are implementation details of the editor integration.
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface PlaceholderOptions {
	placeholder: string
	nestedPlaceholder: string
}

export const Placeholder = Extension.create<PlaceholderOptions>({
	name: 'markdownEditorPlaceholder',

	addOptions: /**
	 * Editor callback.
	 * @returns Callback result.
	 */ () => ({ placeholder: 'Start writing…', nestedPlaceholder: 'Start writing…' }),

	/**
	 * Editor callback.
	 * @returns Callback result.
	 */
	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					decorations: /**
					 * Editor callback.
					 * @param state Parameter value.
					 * @returns Callback result.
					 */ (state) => {
						if (!this.editor.isEditable) return DecorationSet.empty
						const { doc, selection } = state
						const node = selection.$from.parent
						if (!node.isTextblock || node.content.size > 0) return DecorationSet.empty
						const position = selection.$from.before(selection.$from.depth)
						const placeholder =
							selection.$from.depth > 1
								? this.options.nestedPlaceholder
								: this.options.placeholder
						return DecorationSet.create(doc, [
							Decoration.node(position, position + node.nodeSize, {
								class: 'is-editor-empty',
								'data-placeholder': placeholder,
							}),
						])
					},
				},
			}),
		]
	},
})
