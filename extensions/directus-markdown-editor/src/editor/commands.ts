/* eslint-disable jsdoc-js/require-jsdoc -- Command callbacks are private registry implementation details. */
import type { Editor } from '@tiptap/core'

export type EditorCommandGroup = 'history' | 'text' | 'structure' | 'insert' | 'table'

export interface EditorCommand {
	id: string
	label: string
	description: string
	icon: string
	group: EditorCommandGroup
	aliases: string[]
	shortcut?: string
	isActive: (editor: Editor) => boolean
	isDisabled: (editor: Editor) => boolean
	execute: (editor: Editor) => boolean
}

export interface EditorCommandGroupConfig {
	id: EditorCommandGroup
	label: string
	commandIds: string[]
}

export interface EditorToolbarConfig {
	blockTypeCommandIds: string[]
	groups: string[][]
	overflowCommandIds: string[]
	specialCommandIds: string[]
}

export interface EditorTableToolbarConfig {
	groups: string[][]
}

export interface EditorToolOption {
	text: string
	value: string
	commandIds: string[]
}

export const editorTableToolbarConfig: EditorTableToolbarConfig = {
	groups: [
		['add-row-before', 'add-row-after', 'delete-row'],
		['add-column-before', 'add-column-after', 'delete-column'],
		['toggle-header-row', 'toggle-header-column', 'toggle-header-cell'],
		['merge-cells', 'split-cell'],
		['delete-table'],
	],
}

export const editorToolOptions: EditorToolOption[] = [
	{ text: 'Paragraph', value: 'paragraph', commandIds: ['paragraph'] },
	{ text: 'Heading 1', value: 'heading-1', commandIds: ['heading-1'] },
	{ text: 'Heading 2', value: 'heading-2', commandIds: ['heading-2'] },
	{ text: 'Heading 3', value: 'heading-3', commandIds: ['heading-3'] },
	{ text: 'Heading 4', value: 'heading-4', commandIds: ['heading-4'] },
	{ text: 'Heading 5', value: 'heading-5', commandIds: ['heading-5'] },
	{ text: 'Heading 6', value: 'heading-6', commandIds: ['heading-6'] },
	{ text: 'Bold', value: 'bold', commandIds: ['bold'] },
	{ text: 'Italic', value: 'italic', commandIds: ['italic'] },
	{ text: 'Strikethrough', value: 'strike', commandIds: ['strike'] },
	{ text: 'Inline code', value: 'code', commandIds: ['code'] },
	{ text: 'Quote', value: 'blockquote', commandIds: ['blockquote'] },
	{ text: 'Code block', value: 'code-block', commandIds: ['code-block'] },
	{ text: 'Unordered list', value: 'bullet-list', commandIds: ['bullet-list'] },
	{ text: 'Numbered list', value: 'ordered-list', commandIds: ['ordered-list'] },
	{ text: 'Image', value: 'image', commandIds: [] },
	{ text: 'Video / media', value: 'video', commandIds: [] },
	{ text: 'Link insert', value: 'link', commandIds: [] },
	{ text: 'Divider', value: 'horizontal-rule', commandIds: ['horizontal-rule'] },
	{ text: 'Hard break', value: 'hard-break', commandIds: ['hard-break'] },
	{
		text: 'Table',
		value: 'table',
		commandIds: ['insert-table', ...editorTableToolbarConfig.groups.flat()],
	},
	{ text: 'Clear formatting', value: 'clear-formatting', commandIds: ['clear-formatting'] },
	{ text: 'Undo / redo', value: 'history', commandIds: ['undo', 'redo'] },
	{ text: 'Component insert', value: 'component', commandIds: [] },
	{ text: 'Edit source', value: 'source', commandIds: [] },
]

export const editorToolbarConfig: EditorToolbarConfig = {
	blockTypeCommandIds: [
		'paragraph',
		'heading-1',
		'heading-2',
		'heading-3',
		'heading-4',
		'heading-5',
		'heading-6',
		'code-block',
	],
	groups: [['bold', 'italic', 'strike', 'code', 'bullet-list', 'ordered-list', 'blockquote']],
	overflowCommandIds: ['horizontal-rule', 'hard-break', 'insert-table', 'clear-formatting'],
	specialCommandIds: ['undo', 'redo'],
}

export const slashMenuGroups: EditorCommandGroupConfig[] = [
	{
		id: 'structure',
		label: 'Text',
		commandIds: [
			'paragraph',
			'heading-1',
			'heading-2',
			'heading-3',
			'heading-4',
			'heading-5',
			'heading-6',
		],
	},
	{
		id: 'text',
		label: 'Blocks',
		commandIds: ['bullet-list', 'ordered-list', 'blockquote', 'code-block'],
	},
	{
		id: 'insert',
		label: 'Insert',
		commandIds: ['horizontal-rule', 'hard-break', 'insert-table'],
	},
]

function command(config: EditorCommand): EditorCommand {
	return config
}

function markCommand(config: {
	id: string
	label: string
	description: string
	icon: string
	aliases: string[]
	shortcut?: string
	mark: 'bold' | 'italic' | 'strike' | 'code'
	toggle: 'toggleBold' | 'toggleItalic' | 'toggleStrike' | 'toggleCode'
}): EditorCommand {
	return command({
		...config,
		group: 'text',
		isActive: (editor) => editor.isActive(config.mark),
		isDisabled: (editor) => {
			const chain = editor.can()
			if (config.toggle === 'toggleBold') return !chain.toggleBold()
			if (config.toggle === 'toggleItalic') return !chain.toggleItalic()
			if (config.toggle === 'toggleStrike') return !chain.toggleStrike()
			return !chain.toggleCode()
		},
		execute: (editor) => {
			const chain = editor.chain().focus()
			if (config.toggle === 'toggleBold') return chain.toggleBold().run()
			if (config.toggle === 'toggleItalic') return chain.toggleItalic().run()
			if (config.toggle === 'toggleStrike') return chain.toggleStrike().run()
			return chain.toggleCode().run()
		},
	})
}

function headingCommand(level: 1 | 2 | 3 | 4 | 5 | 6): EditorCommand {
	return command({
		id: `heading-${level}`,
		label: `Heading ${level}`,
		description: `Use a level ${level} section heading`,
		icon: `format_h${level}`,
		group: 'structure',
		aliases: [`h${level}`, `title ${level}`, `header ${level}`],
		isActive: (editor) => editor.isActive('heading', { level }),
		isDisabled: (editor) => !editor.can().toggleHeading({ level }),
		execute: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
	})
}

/**
 * Create the shared editor command catalog used by every editor control surface.
 * @returns Ordered editor commands.
 */
export function createEditorCommands(): EditorCommand[] {
	return [
		command({
			id: 'undo',
			label: 'Undo',
			description: 'Undo the last change',
			icon: 'undo',
			group: 'history',
			aliases: ['back', 'revert'],
			shortcut: 'Mod-z',
			isActive: () => false,
			isDisabled: (editor) => !editor.can().undo(),
			execute: (editor) => editor.chain().focus().undo().run(),
		}),
		command({
			id: 'redo',
			label: 'Redo',
			description: 'Redo the last undone change',
			icon: 'redo',
			group: 'history',
			aliases: ['forward', 'repeat'],
			shortcut: 'Mod-Shift-z',
			isActive: () => false,
			isDisabled: (editor) => !editor.can().redo(),
			execute: (editor) => editor.chain().focus().redo().run(),
		}),
		markCommand({
			id: 'bold',
			label: 'Bold',
			description: 'Emphasize text strongly',
			icon: 'format_bold',
			aliases: ['strong', 'heavy'],
			shortcut: 'Mod-b',
			mark: 'bold',
			toggle: 'toggleBold',
		}),
		markCommand({
			id: 'italic',
			label: 'Italic',
			description: 'Emphasize text',
			icon: 'format_italic',
			aliases: ['emphasis', 'em'],
			shortcut: 'Mod-i',
			mark: 'italic',
			toggle: 'toggleItalic',
		}),
		markCommand({
			id: 'strike',
			label: 'Strikethrough',
			description: 'Mark text as removed',
			icon: 'format_strikethrough',
			aliases: ['strike', 'deleted'],
			mark: 'strike',
			toggle: 'toggleStrike',
		}),
		markCommand({
			id: 'code',
			label: 'Inline code',
			description: 'Format text as inline code',
			icon: 'code',
			aliases: ['monospace', 'snippet'],
			shortcut: 'Mod-e',
			mark: 'code',
			toggle: 'toggleCode',
		}),
		command({
			id: 'paragraph',
			label: 'Paragraph',
			description: 'Start with plain text',
			icon: 'format_paragraph',
			group: 'structure',
			aliases: ['text', 'body', 'normal'],
			isActive: (editor) => editor.isActive('paragraph'),
			isDisabled: (editor) => !editor.can().setParagraph(),
			execute: (editor) => editor.chain().focus().setParagraph().run(),
		}),
		headingCommand(1),
		headingCommand(2),
		headingCommand(3),
		headingCommand(4),
		headingCommand(5),
		headingCommand(6),
		command({
			id: 'bullet-list',
			label: 'Bullet list',
			description: 'Create an unordered list',
			icon: 'format_list_bulleted',
			group: 'structure',
			aliases: ['unordered list', 'ul', 'bullets'],
			isActive: (editor) => editor.isActive('bulletList'),
			isDisabled: (editor) => !editor.can().toggleBulletList(),
			execute: (editor) => editor.chain().focus().toggleBulletList().run(),
		}),
		command({
			id: 'ordered-list',
			label: 'Numbered list',
			description: 'Create an ordered list',
			icon: 'format_list_numbered',
			group: 'structure',
			aliases: ['ordered list', 'ol', 'numbers'],
			isActive: (editor) => editor.isActive('orderedList'),
			isDisabled: (editor) => !editor.can().toggleOrderedList(),
			execute: (editor) => editor.chain().focus().toggleOrderedList().run(),
		}),
		command({
			id: 'blockquote',
			label: 'Blockquote',
			description: 'Highlight a quotation',
			icon: 'format_quote',
			group: 'structure',
			aliases: ['quote', 'citation'],
			isActive: (editor) => editor.isActive('blockquote'),
			isDisabled: (editor) => !editor.can().toggleBlockquote(),
			execute: (editor) => editor.chain().focus().toggleBlockquote().run(),
		}),
		command({
			id: 'code-block',
			label: 'Code block',
			description: 'Insert a block of source code',
			icon: 'integration_instructions',
			group: 'structure',
			aliases: ['pre', 'fence', 'snippet'],
			isActive: (editor) => editor.isActive('codeBlock'),
			isDisabled: (editor) => !editor.can().toggleCodeBlock(),
			execute: (editor) => editor.chain().focus().toggleCodeBlock().run(),
		}),
		command({
			id: 'horizontal-rule',
			label: 'Divider',
			description: 'Separate sections with a horizontal rule',
			icon: 'horizontal_rule',
			group: 'insert',
			aliases: ['horizontal rule', 'separator', 'hr', 'line'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().setHorizontalRule(),
			execute: (editor) => editor.chain().focus().setHorizontalRule().run(),
		}),
		command({
			id: 'hard-break',
			label: 'Hard break',
			description: 'Insert a line break without a new paragraph',
			icon: 'keyboard_return',
			group: 'insert',
			aliases: ['line break', 'br', 'newline'],
			shortcut: 'Shift-Enter',
			isActive: () => false,
			isDisabled: (editor) => !editor.can().setHardBreak(),
			execute: (editor) => editor.chain().focus().setHardBreak().run(),
		}),
		command({
			id: 'insert-table',
			label: 'Table',
			description: 'Insert a three-column table',
			icon: 'table',
			group: 'insert',
			aliases: ['grid', 'rows', 'columns'],
			isActive: (editor) => editor.isActive('table'),
			isDisabled: (editor) =>
				!editor.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
			execute: (editor) =>
				editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
		}),
		command({
			id: 'add-row-before',
			label: 'Add row above',
			description: 'Add a row above the current table row',
			icon: 'add_row_above',
			group: 'table',
			aliases: ['table row', 'row above', 'insert row before'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().addRowBefore(),
			execute: (editor) => editor.chain().focus().addRowBefore().run(),
		}),
		command({
			id: 'add-row-after',
			label: 'Add row below',
			description: 'Add a row below the current table row',
			icon: 'add_row_below',
			group: 'table',
			aliases: ['table row', 'row below', 'insert row after'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().addRowAfter(),
			execute: (editor) => editor.chain().focus().addRowAfter().run(),
		}),
		command({
			id: 'add-column-before',
			label: 'Add column left',
			description: 'Add a column before the current table column',
			icon: 'add_column_left',
			group: 'table',
			aliases: ['table column', 'column left', 'insert column before'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().addColumnBefore(),
			execute: (editor) => editor.chain().focus().addColumnBefore().run(),
		}),
		command({
			id: 'add-column-after',
			label: 'Add column right',
			description: 'Add a column after the current table column',
			icon: 'add_column_right',
			group: 'table',
			aliases: ['table column', 'column right', 'insert column after'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().addColumnAfter(),
			execute: (editor) => editor.chain().focus().addColumnAfter().run(),
		}),
		command({
			id: 'delete-row',
			label: 'Delete table row',
			description: 'Delete the current table row',
			icon: 'delete_sweep',
			group: 'table',
			aliases: ['remove row'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().deleteRow(),
			execute: (editor) => editor.chain().focus().deleteRow().run(),
		}),
		command({
			id: 'delete-column',
			label: 'Delete table column',
			description: 'Delete the current table column',
			icon: 'delete_sweep',
			group: 'table',
			aliases: ['remove column'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().deleteColumn(),
			execute: (editor) => editor.chain().focus().deleteColumn().run(),
		}),
		command({
			id: 'toggle-header-row',
			label: 'Toggle header row',
			description: 'Make the current row a table header row',
			icon: 'table_rows',
			group: 'table',
			aliases: ['table head', 'thead', 'header row'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().toggleHeaderRow(),
			execute: (editor) => editor.chain().focus().toggleHeaderRow().run(),
		}),
		command({
			id: 'toggle-header-column',
			label: 'Toggle header column',
			description: 'Make the current column a table header column',
			icon: 'view_column',
			group: 'table',
			aliases: ['header column', 'row labels'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().toggleHeaderColumn(),
			execute: (editor) => editor.chain().focus().toggleHeaderColumn().run(),
		}),
		command({
			id: 'toggle-header-cell',
			label: 'Toggle header cell',
			description: 'Toggle the current cell between header and body',
			icon: 'select_window',
			group: 'table',
			aliases: ['header cell', 'th', 'table heading'],
			isActive: (editor) => editor.isActive('tableHeader'),
			isDisabled: (editor) => !editor.can().toggleHeaderCell(),
			execute: (editor) => editor.chain().focus().toggleHeaderCell().run(),
		}),
		command({
			id: 'merge-cells',
			label: 'Merge cells',
			description: 'Merge the selected table cells',
			icon: 'call_merge',
			group: 'table',
			aliases: ['combine cells', 'join cells', 'colspan'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().mergeCells(),
			execute: (editor) => editor.chain().focus().mergeCells().run(),
		}),
		command({
			id: 'split-cell',
			label: 'Split cell',
			description: 'Split the current merged table cell',
			icon: 'call_split',
			group: 'table',
			aliases: ['unmerge cells', 'separate cell'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().splitCell(),
			execute: (editor) => editor.chain().focus().splitCell().run(),
		}),
		command({
			id: 'delete-table',
			label: 'Delete table',
			description: 'Remove the current table',
			icon: 'delete',
			group: 'table',
			aliases: ['remove table'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().deleteTable(),
			execute: (editor) => editor.chain().focus().deleteTable().run(),
		}),
		command({
			id: 'clear-formatting',
			label: 'Clear formatting',
			description: 'Reset the selected text to plain formatting',
			icon: 'format_clear',
			group: 'text',
			aliases: ['reset', 'plain text', 'remove formatting'],
			isActive: () => false,
			isDisabled: (editor) => !editor.can().unsetAllMarks(),
			execute: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
		}),
	]
}

/**
 * Resolve configured command ids while preserving the configuration order.
 * @param commands Available commands.
 * @param ids Ordered command identifiers.
 * @returns Resolved commands.
 */
export function resolveCommands(commands: EditorCommand[], ids: string[]): EditorCommand[] {
	return ids.flatMap((id) => {
		const match = commands.find((candidate) => candidate.id === id)
		return match ? [match] : []
	})
}

/**
 * Determine whether an interface tool is enabled by the saved configuration.
 * @param enabledTools Selected tool identifiers, or undefined to preserve the all-tools default.
 * @param toolId Tool identifier to inspect.
 * @returns Whether the tool is enabled.
 */
export function isEditorToolEnabled(
	enabledTools: readonly string[] | null | undefined,
	toolId: string,
): boolean {
	return (
		enabledTools === undefined ||
		enabledTools?.includes('all') === true ||
		enabledTools?.includes(toolId) === true
	)
}

/**
 * Filter editor commands through the interface tool configuration.
 * @param commands Complete command catalog.
 * @param enabledTools Selected tool identifiers.
 * @returns Commands exposed to editor control surfaces.
 */
export function filterEditorCommands(
	commands: EditorCommand[],
	enabledTools: readonly string[] | null | undefined,
): EditorCommand[] {
	if (enabledTools === undefined || enabledTools?.includes('all') === true) return commands
	const enabledCommandIds = new Set(
		editorToolOptions
			.filter((option) => enabledTools?.includes(option.value) === true)
			.flatMap((option) => option.commandIds),
	)
	return commands.filter((command) => enabledCommandIds.has(command.id))
}
