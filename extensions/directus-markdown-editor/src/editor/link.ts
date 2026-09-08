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
 * Editor callback.
 * @param editor Parameter value.
 * @returns Callback result.
 */
export function readLinkSelection(editor: Editor): LinkSelection {
	const { from, to } = editor.state.selection
	const linkMark = editor.schema.marks.link
	const range = linkMark ? getMarkRange(editor.state.doc.resolve(from), linkMark) : undefined
	const text = editor.state.doc.textBetween(range?.from ?? from, range?.to ?? to, ' ')
	const attributes = editor.getAttributes('link')

	return {
		url: typeof attributes.href === 'string' ? attributes.href : '',
		title: typeof attributes.title === 'string' ? attributes.title : '',
		text,
	}
}

/**
 * Editor callback.
 * @param editor Parameter value.
 * @param selection Parameter value.
 * @param range Parameter value.
 * @returns Callback result.
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
 * Editor callback.
 * @param onTrigger Parameter value.
 * @param isEnabled Resolve whether link editing is enabled.
 * @returns Callback result.
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
 * Editor callback.
 * @param url Parameter value.
 * @returns Callback result.
 */
function isSafeLink(url: string): boolean {
	try {
		const protocol = new URL(url, 'https://directus.local').protocol
		return ['http:', 'https:', 'mailto:', 'tel:'].includes(protocol)
	} catch {
		return false
	}
}
