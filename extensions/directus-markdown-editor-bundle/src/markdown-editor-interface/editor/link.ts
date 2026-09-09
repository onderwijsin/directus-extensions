import { attemptSync, isString } from '@onderwijsin/directus-extension-utils'
// Link callbacks are implementation details of the editor integration.
import { Extension, type Editor } from '@tiptap/core'
import { getMarkRange } from '@tiptap/core'

export interface LinkSelection {
	url: string
	title: string
	text: string
}

export interface LinkRange {
	from: number
	to: number
}

/**
 * Reads the active link mark and its selected text from the editor state.
 * @param editor Tiptap editor whose current selection should be inspected.
 * @returns Link URL, title, and selected text.
 */
export function readLinkSelection(editor: Editor): LinkSelection {
	const { from, to } = editor.state.selection
	const linkMark = editor.schema.marks.link
	const range = linkMark ? getMarkRange(editor.state.doc.resolve(from), linkMark) : undefined
	const text = editor.state.doc.textBetween(range?.from ?? from, range?.to ?? to, ' ')
	const attributes = editor.getAttributes('link')

	return {
		url: isString(attributes.href) ? attributes.href : '',
		title: isString(attributes.title) ? attributes.title : '',
		text,
	}
}

/**
 * Applies a validated link selection to a document range.
 * @param editor Tiptap editor to update.
 * @param selection Link URL, title, and replacement text.
 * @param range Document range receiving the link.
 * @returns Whether Tiptap executed the update successfully.
 */
export function saveLinkSelection(
	editor: Editor,
	selection: LinkSelection,
	range: LinkRange,
): boolean {
	if (
		editor.state.doc.resolve(range.from).parent.type.name === 'codeBlock' ||
		editor.state.doc.resolve(range.to).parent.type.name === 'codeBlock'
	) {
		return false
	}
	const url = selection.url.trim()
	if (!url || !isSafeLink(url)) return false

	const chain = editor
		.chain()
		.focus()
		.setTextSelection(range)
		.setLink({ href: url, title: selection.title.trim() || null })
	if (!range.from || range.from === range.to) chain.insertContent(selection.text)
	return chain.run()
}

/**
 * Creates the Mod-K shortcut that opens link editing outside code blocks.
 * @param onTrigger Callback invoked when link editing should open.
 * @param isEnabled Predicate controlling whether the shortcut is active.
 * @returns A Tiptap extension registering the shortcut.
 */
export function createLinkShortcut(onTrigger: () => void, isEnabled: () => boolean = () => true) {
	return Extension.create({
		name: 'markdownEditorLinkShortcut',

		/** @returns The code-block-aware link shortcut. */
		addKeyboardShortcuts() {
			return {
				'Mod-k': /**
				 * Editor callback.
				 * @returns Callback result.
				 */ () => {
					if (!isEnabled()) return true
					if (this.editor.isActive('codeBlock')) return false
					onTrigger()
					return true
				},
			}
		},
	})
}

/**
 * Checks whether a link uses a permitted web or contact protocol.
 * @param url Link URL to inspect.
 * @returns Whether the URL uses `http`, `https`, `mailto`, or `tel`.
 */
function isSafeLink(url: string): boolean {
	const result = attemptSync(() => new URL(url, 'https://directus.local').protocol)
	return !!(
		result.error === null &&
		result.data &&
		['http:', 'https:', 'mailto:', 'tel:'].includes(result.data)
	)
}
