import { attemptSync, isString } from '@onderwijsin/directus-extension-utils'
// Link callbacks are implementation details of the editor integration.
import { Extension, type Editor } from '@tiptap/core'
import { getMarkRange } from '@tiptap/core'
import { z } from 'zod'

export const LinkTypeSchema = z.enum(['url', 'internal', 'email', 'phone'])
export type LinkType = z.infer<typeof LinkTypeSchema>

const WebUrlSchema = z
	.url({ error: 'Enter a valid URL including https:// or http://.' })
	.refine((value) => /^https?:\/\//iu.test(value), {
		error: 'Enter a valid URL including https:// or http://.',
	})
const InternalPathSchema = z.string().startsWith('/', {
	error: 'Enter an internal path starting with /.',
})
const EmailSchema = z.email({ error: 'Enter a valid email address.' })
const PhoneSchema = z.string().min(1, { error: 'Enter a phone number.' })

export interface LinkSelection {
	type: LinkType
	url: string
	title: string
	text: string
}

export interface LinkRange {
	from: number
	to: number
}

/**
 * Resolves the complete active link range, or falls back to the current selection.
 * @param editor Tiptap editor whose current selection should be inspected.
 * @returns Document range containing the active link or current selection.
 */
export function readLinkRange(editor: Editor): LinkRange {
	const { from, to } = editor.state.selection
	const linkMark = editor.schema.marks.link
	const range = linkMark ? getMarkRange(editor.state.doc.resolve(from), linkMark) : undefined
	return range ?? { from, to }
}

/**
 * Reads the active link mark and its selected text from the editor state.
 * @param editor Tiptap editor whose current selection should be inspected.
 * @returns Link URL, title, and selected text.
 */
export function readLinkSelection(editor: Editor): LinkSelection {
	const range = readLinkRange(editor)
	const text = editor.state.doc.textBetween(range.from, range.to, ' ')
	const attributes = editor.getAttributes('link')

	return {
		type: 'url',
		url: isString(attributes.href) ? attributes.href : '',
		title: isString(attributes.title) ? attributes.title : '',
		text,
	}
}

/**
 * Validate a link value according to its author-selected type.
 * @param type Link type selected in the editor.
 * @param value Raw link value entered by the author.
 * @returns A validation message, or nothing when the value is valid.
 */
export function linkValueError(type: LinkType, value: string): string | undefined {
	const input = value.trim()
	const schema = {
		url: WebUrlSchema,
		internal: InternalPathSchema,
		email: EmailSchema,
		phone: PhoneSchema,
	}[type]
	const result = schema.safeParse(input)
	return result.success ? undefined : result.error.issues[0]?.message
}

/**
 * Convert a validated drawer value to the href persisted in Markdown.
 * @param type Link type selected in the editor.
 * @param value Validated link value.
 * @returns Standard href for the selected link type.
 */
export function linkHref(type: LinkType, value: string): string {
	const input = value.trim()
	if (type === 'email') return `mailto:${input}`
	if (type === 'phone') return `tel:${input}`
	return input
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
	const text = selection.text.trim()
	if (linkValueError(selection.type, url) || !text) return false
	const href = linkHref(selection.type, url)
	if (!isSafeLink(href)) return false

	const chain = editor
		.chain()
		.focus()
		.setTextSelection(range)
		.insertContent(text)
		.setTextSelection({ from: range.from, to: range.from + text.length })
		.setLink({ href, title: selection.title.trim() || null })
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
