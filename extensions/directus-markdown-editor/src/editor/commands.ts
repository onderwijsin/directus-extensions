// Command callbacks are implementation details of the editor command registry.
import type { Editor } from '@tiptap/core'

export interface EditorCommand {
	id: string
	label: string
	icon: string
	shortcut?: string
	isActive: (editor: Editor) => boolean
	isDisabled: (editor: Editor) => boolean
	execute: (editor: Editor) => boolean
}

/**
 * Editor callback.
 * @param id Parameter value.
 * @param label Parameter value.
 * @param icon Parameter value.
 * @param command Parameter value.
 * @param shortcut Parameter value.
 * @returns Callback result.
 */
function markCommand(
	id: string,
	label: string,
	icon: string,
	command: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleCode',
	shortcut?: string,
): EditorCommand {
	const execute = {
		toggleBold: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.chain().focus().toggleBold().run(),

		toggleItalic: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.chain().focus().toggleItalic().run(),

		toggleStrike: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.chain().focus().toggleStrike().run(),

		toggleCode: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.chain().focus().toggleCode().run(),
	}[command]
	const canExecute = {
		toggleBold: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.can().toggleBold(),

		toggleItalic: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.can().toggleItalic(),

		toggleStrike: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.can().toggleStrike(),

		toggleCode: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor: Editor) => editor.can().toggleCode(),
	}[command]
	const activeName = {
		toggleBold: 'bold',
		toggleItalic: 'italic',
		toggleStrike: 'strike',
		toggleCode: 'code',
	}[command]

	return {
		id,
		label,
		icon,
		shortcut,

		isActive: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => editor.isActive(activeName),

		isDisabled: /**
		 * Editor callback.
		 * @param editor Parameter value.
		 * @returns Callback result.
		 */ (editor) => !canExecute(editor),
		execute,
	}
}

/**
 * Editor callback.
 * @returns Callback result.
 */
export function createEditorCommands(): EditorCommand[] {
	return [
		{
			id: 'undo',
			label: 'Undo',
			icon: 'undo',
			shortcut: 'Mod-z',

			isActive: /**
			 * Editor callback.
			 * @returns Callback result.
			 */ () => false,

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().undo(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().undo().run(),
		},
		{
			id: 'redo',
			label: 'Redo',
			icon: 'redo',
			shortcut: 'Mod-Shift-z',

			isActive: /**
			 * Editor callback.
			 * @returns Callback result.
			 */ () => false,

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().redo(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().redo().run(),
		},
		markCommand('bold', 'Bold', 'format_bold', 'toggleBold', 'Mod-b'),
		markCommand('italic', 'Italic', 'format_italic', 'toggleItalic', 'Mod-i'),
		markCommand('strike', 'Strikethrough', 'format_strikethrough', 'toggleStrike'),
		markCommand('code', 'Inline code', 'code', 'toggleCode', 'Mod-e'),
		{
			id: 'paragraph',
			label: 'Paragraph',
			icon: 'format_paragraph',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('paragraph'),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().setParagraph(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().setParagraph().run(),
		},
		{
			id: 'heading-1',
			label: 'Heading 1',
			icon: 'format_h1',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('heading', { level: 1 }),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleHeading({ level: 1 }),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
		},
		{
			id: 'heading-2',
			label: 'Heading 2',
			icon: 'format_h2',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('heading', { level: 2 }),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleHeading({ level: 2 }),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
		},
		{
			id: 'heading-3',
			label: 'Heading 3',
			icon: 'format_h3',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('heading', { level: 3 }),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleHeading({ level: 3 }),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
		},
		{
			id: 'horizontal-rule',
			label: 'Horizontal rule',
			icon: 'horizontal_rule',

			isActive: /**
			 * Editor callback.
			 * @returns Callback result.
			 */ () => false,

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().setHorizontalRule(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().setHorizontalRule().run(),
		},
		{
			id: 'blockquote',
			label: 'Blockquote',
			icon: 'format_quote',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('blockquote'),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleBlockquote(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleBlockquote().run(),
		},
		{
			id: 'bullet-list',
			label: 'Bullet list',
			icon: 'format_list_bulleted',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('bulletList'),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleBulletList(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleBulletList().run(),
		},
		{
			id: 'ordered-list',
			label: 'Numbered list',
			icon: 'format_list_numbered',

			isActive: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.isActive('orderedList'),

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().toggleOrderedList(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().toggleOrderedList().run(),
		},
		{
			id: 'clear-formatting',
			label: 'Clear formatting',
			icon: 'format_clear',

			isActive: /**
			 * Editor callback.
			 * @returns Callback result.
			 */ () => false,

			isDisabled: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => !editor.can().unsetAllMarks(),

			execute: /**
			 * Editor callback.
			 * @param editor Parameter value.
			 * @returns Callback result.
			 */ (editor) => editor.chain().focus().unsetAllMarks().run(),
		},
	]
}
