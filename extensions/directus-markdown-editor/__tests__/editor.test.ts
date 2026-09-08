// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it, vi } from 'vitest'

import { deleteBlock, duplicateBlock, moveBlockDown, moveBlockUp } from '../src/editor/block'
import { parseCodeBlockInfo } from '../src/editor/code-block'
import { codeLanguageOptions } from '../src/editor/code-languages'
import {
	createEditorCommands,
	editorTableToolbarConfig,
	editorToolOptions,
	editorToolbarConfig,
	filterEditorCommands,
	isEditorToolEnabled,
	resolveCommands,
} from '../src/editor/commands'
import { ClearMarksOnEnter } from '../src/editor/enter'
import { createEditorExtensions } from '../src/editor/extensions'
import { isSupportedCodeLanguage } from '../src/editor/highlighter'
import { insertComponent } from '../src/editor/insertion'
import { createLinkShortcut, readLinkSelection, saveLinkSelection } from '../src/editor/link'
import { directusAssetUrl, sanitizeImageUrl } from '../src/editor/media'
import { createSlashItems, filterSlashItems } from '../src/editor/slash'
import { synchronizeEditorMarkdown } from '../src/editor/synchronization'
import { MdcBlock, MdcInline, MdcSlot } from '../src/markdown'

function createEditor(content = '<p>Hello world</p>') {
	return new Editor({ extensions: [StarterKit], content })
}

describe('editor commands', () => {
	it('defines a complete, unique, configuration-driven command catalog', () => {
		const commands = createEditorCommands()
		const ids = commands.map((command) => command.id)

		expect(new Set(ids).size).toBe(ids.length)
		expect(ids).toEqual(
			expect.arrayContaining([
				'heading-6',
				'code-block',
				'hard-break',
				'insert-table',
				'add-row-before',
				'add-row-after',
				'add-column-before',
				'add-column-after',
				'delete-row',
				'delete-column',
				'toggle-header-row',
				'toggle-header-column',
				'toggle-header-cell',
				'merge-cells',
				'split-cell',
				'delete-table',
			]),
		)
		expect(
			resolveCommands(commands, editorToolbarConfig.blockTypeCommandIds).map(
				(command) => command.id,
			),
		).toEqual(editorToolbarConfig.blockTypeCommandIds)
		expect(
			editorTableToolbarConfig.groups
				.flatMap((ids) => resolveCommands(commands, ids))
				.map((command) => command.id),
		).toEqual(editorTableToolbarConfig.groups.flat())
	})

	it('executes table row commands from the dedicated table toolbar catalog', () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true)
		const addRow = createEditorCommands().find((command) => command.id === 'add-row-after')
		const deleteTable = createEditorCommands().find((command) => command.id === 'delete-table')
		expect(addRow).toBeDefined()
		expect(deleteTable).toBeDefined()
		if (!addRow || !deleteTable) return

		expect(addRow.isDisabled(editor)).toBe(false)
		expect(addRow.execute(editor)).toBe(true)
		expect(editor.getJSON().content?.[0]?.content).toHaveLength(3)
		expect(deleteTable.isDisabled(editor)).toBe(false)
		expect(deleteTable.execute(editor)).toBe(true)
		expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(false)
		editor.destroy()
	})

	it('deletes a node-selected table from the dedicated table toolbar catalog', () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(true)
		expect(editor.commands.setNodeSelection(0)).toBe(true)
		const deleteTable = createEditorCommands().find((command) => command.id === 'delete-table')
		expect(deleteTable).toBeDefined()
		if (!deleteTable) return

		expect(deleteTable.isDisabled(editor)).toBe(false)
		expect(deleteTable.execute(editor)).toBe(true)
		expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(false)
		editor.destroy()
	})

	it('replaces the plain code block with Shiki highlighting', () => {
		const codeBlock = createEditorExtensions().find(
			(extension) => extension.name === 'codeBlock',
		)

		expect(codeBlock).toBeDefined()
		expect(codeBlock?.config.addProseMirrorPlugins).toBeTypeOf('function')
	})

	it('offers a focused set of common and web-development languages', () => {
		expect(codeLanguageOptions.length).toBeGreaterThan(50)
		expect(codeLanguageOptions.length).toBeLessThan(100)
		expect(codeLanguageOptions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ value: 'c' }),
				expect.objectContaining({ value: 'cpp' }),
				expect.objectContaining({ value: 'python' }),
				expect.objectContaining({ value: 'php' }),
				expect.objectContaining({ value: 'ts' }),
				expect.objectContaining({ value: 'vue' }),
				expect.objectContaining({ value: 'astro' }),
				expect.objectContaining({ value: 'dockerfile' }),
				expect.objectContaining({ value: 'graphql' }),
				expect.objectContaining({ value: 'mdx' }),
				expect.objectContaining({ value: 'prisma' }),
				expect.objectContaining({ value: 'svelte' }),
			]),
		)
		for (const option of codeLanguageOptions) {
			expect(option.value === 'plaintext' || isSupportedCodeLanguage(option.value)).toBe(true)
		}
	})

	it('preserves and safely clamps the cursor while synchronizing external Markdown', () => {
		const editor = new Editor({
			extensions: [StarterKit, Markdown],
			content: 'A sufficiently long paragraph.',
			contentType: 'markdown',
		})
		editor.commands.setTextSelection(10)

		expect(synchronizeEditorMarkdown(editor, 'An updated sufficiently long paragraph.')).toBe(
			true,
		)
		expect(editor.state.selection.from).toBe(10)
		expect(synchronizeEditorMarkdown(editor, 'Hi')).toBe(true)
		expect(editor.state.selection.from).toBe(editor.state.doc.content.size - 1)
		expect(synchronizeEditorMarkdown(editor, 'Hi')).toBe(false)

		editor.destroy()
	})

	it('parses and serializes Nuxt Content code metadata', () => {
		expect(parseCodeBlockInfo('ts [app/nuxt.config.ts]')).toEqual({
			language: 'ts',
			filename: 'app/nuxt.config.ts',
		})
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '```ts [app/nuxt.config.ts]\nconst enabled = true\n```',
			contentType: 'markdown',
		})

		expect(editor.getJSON().content?.[0]?.attrs).toMatchObject({
			language: 'ts',
			filename: 'app/nuxt.config.ts',
			collapse: false,
		})
		expect(editor.getMarkdown()).toBe('```ts [app/nuxt.config.ts]\nconst enabled = true\n```')
		editor.destroy()
	})

	it('round-trips Nuxt Content collapsible code blocks', () => {
		const source = '::code-collapse\n\n```css [app.css]\nbody { color: red; }\n```\n\n::'
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: source,
			contentType: 'markdown',
		})

		expect(editor.getJSON().content?.[0]).toMatchObject({
			type: 'codeBlock',
			attrs: { language: 'css', filename: 'app.css', collapse: true },
		})
		expect(editor.getMarkdown()).toBe(source)
		editor.destroy()
	})

	it('indents code blocks with Tab and keeps incompatible actions disabled', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '```ts\nconst enabled = true\n```',
			contentType: 'markdown',
		})
		editor.commands.setTextSelection(1)

		expect(editor.commands.keyboardShortcut('Tab')).toBe(true)
		expect(editor.getMarkdown()).toContain('\n    const enabled = true\n')

		const commands = createEditorCommands()
		for (const id of [
			'blockquote',
			'bullet-list',
			'ordered-list',
			'horizontal-rule',
			'hard-break',
			'insert-table',
			'clear-formatting',
		]) {
			expect(commands.find((command) => command.id === id)?.isDisabled(editor)).toBe(true)
		}
		expect(commands.find((command) => command.id === 'paragraph')?.isDisabled(editor)).toBe(
			false,
		)
		expect(
			saveLinkSelection(
				editor,
				{ url: 'https://example.com', title: 'Example', text: 'const' },
				{ from: 1, to: 6 },
			),
		).toBe(false)
		editor.destroy()
	})

	it('preserves the current code indentation after Enter', () => {
		const code = '    const enabled = true'
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: `\`\`\`ts\n${code}\n\`\`\``,
			contentType: 'markdown',
		})
		editor.commands.setTextSelection(code.length + 1)

		expect(editor.commands.keyboardShortcut('Enter')).toBe(true)
		expect(editor.state.selection.$from.parent.textContent).toBe(`${code}\n    `)

		editor.destroy()
	})

	it('blocks native Tiptap shortcuts for tools disabled by configuration', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(
				() => [],
				{},
				() => ['paragraph'],
			),
			content: '<p>Shortcut</p>',
		})
		editor.commands.selectAll()

		expect(editor.commands.keyboardShortcut('Mod-b')).toBe(true)
		expect(editor.getHTML()).toBe('<p>Shortcut</p>')
		expect(editor.commands.keyboardShortcut('Mod-Alt-1')).toBe(true)
		expect(editor.getHTML()).toBe('<p>Shortcut</p>')
		expect(editor.commands.keyboardShortcut('Mod-Alt-c')).toBe(true)
		expect(editor.getHTML()).toBe('<p>Shortcut</p>')
		editor.destroy()
	})

	it('consumes the link shortcut when link editing is disabled', () => {
		const onTrigger = vi.fn()
		const editor = new Editor({
			extensions: [StarterKit, createLinkShortcut(onTrigger, () => false)],
			content: '<p>Link</p>',
		})

		expect(editor.commands.keyboardShortcut('Mod-k')).toBe(true)
		expect(onTrigger).not.toHaveBeenCalled()
		editor.destroy()
	})

	it('executes formatting commands and exposes active state', () => {
		const editor = createEditor()
		const bold = createEditorCommands().find((command) => command.id === 'bold')
		expect(bold).toBeDefined()

		editor.commands.selectAll()
		if (!bold) return
		expect(bold.isDisabled(editor)).toBe(false)
		expect(bold.execute(editor)).toBe(true)
		expect(bold.isActive(editor)).toBe(true)
		expect(editor.getHTML()).toContain('<strong>Hello world</strong>')
		editor.destroy()
	})

	it('does not carry inline marks onto a new line', () => {
		const editor = new Editor({
			extensions: [StarterKit, ClearMarksOnEnter],
			content: '<p><strong>Bold</strong></p>',
		})
		editor.commands.setTextSelection({ from: 6, to: 6 })

		expect(editor.commands.keyboardShortcut('Enter')).toBe(true)
		expect(editor.isActive('bold')).toBe(false)
		editor.commands.insertContent('plain')

		expect(editor.getHTML()).toContain('<p><strong>Bold</strong></p><p>plain</p>')
		editor.destroy()
	})

	it('keeps quote and list Enter behavior while clearing marks', () => {
		const quoteEditor = new Editor({
			extensions: [StarterKit, ClearMarksOnEnter],
			content: '<blockquote><p><strong>Quote</strong></p></blockquote>',
		})
		quoteEditor.commands.setTextSelection({ from: 9, to: 9 })

		expect(quoteEditor.commands.keyboardShortcut('Enter')).toBe(true)
		expect(quoteEditor.getHTML()).toContain(
			'<blockquote><p><strong>Quote</strong></p><p></p></blockquote>',
		)
		expect(quoteEditor.isActive('bold')).toBe(false)
		quoteEditor.commands.keyboardShortcut('Enter')
		expect(quoteEditor.getHTML()).toContain('</blockquote><p></p>')
		quoteEditor.destroy()

		const listEditor = new Editor({
			extensions: [StarterKit, ClearMarksOnEnter],
			content: '<ul><li><p><strong>Item</strong></p></li></ul>',
		})
		listEditor.commands.setTextSelection({ from: 8, to: 8 })

		expect(listEditor.commands.keyboardShortcut('Enter')).toBe(true)
		expect(listEditor.getHTML()).toContain(
			'<ul><li><p><strong>Item</strong></p></li><li><p></p></li></ul>',
		)
		expect(listEditor.isActive('bold')).toBe(false)
		listEditor.commands.keyboardShortcut('Enter')
		expect(listEditor.getHTML()).toContain(
			'<ul><li><p><strong>Item</strong></p></li></ul><p></p>',
		)
		listEditor.destroy()
	})

	it('exits an MDC component from a trailing empty slot paragraph', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: {
				type: 'doc',
				content: [
					{
						type: 'mdcBlock',
						attrs: { name: 'Callout', props: {}, depth: 2, propsFormat: 'inline' },
						content: [
							{
								type: 'mdcSlot',
								attrs: { name: 'default' },
								content: [
									{
										type: 'paragraph',
										content: [{ type: 'text', text: 'Content' }],
									},
									{ type: 'paragraph' },
								],
							},
						],
					},
				],
			},
		})
		let emptyParagraphPosition: number | undefined
		editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'paragraph' && node.content.size === 0) {
				emptyParagraphPosition = position
			}
		})
		expect(emptyParagraphPosition).toBeDefined()
		if (emptyParagraphPosition === undefined) {
			editor.destroy()
			return
		}
		editor.commands.setTextSelection(emptyParagraphPosition + 1)

		expect(editor.commands.keyboardShortcut('Enter')).toBe(true)
		expect(editor.getJSON().content).toMatchObject([
			{
				type: 'mdcBlock',
				content: [
					{
						type: 'mdcSlot',
						content: [
							{ type: 'paragraph', content: [{ text: 'Content' }] },
							{ type: 'paragraph' },
						],
					},
				],
			},
			{ type: 'paragraph' },
		])
		editor.destroy()
	})

	it('inserts a top-level paragraph before a complex node when exiting an MDC slot', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: {
				type: 'doc',
				content: [
					{
						type: 'mdcBlock',
						attrs: { name: 'Hero', props: {}, depth: 2, propsFormat: 'inline' },
						content: [
							{
								type: 'mdcSlot',
								attrs: { name: 'title' },
								content: [{ type: 'paragraph' }],
							},
						],
					},
					{
						type: 'table',
						content: [
							{
								type: 'tableRow',
								content: [
									{
										type: 'tableCell',
										content: [{ type: 'paragraph' }],
									},
								],
							},
						],
					},
				],
			},
		})
		let slotParagraphPosition: number | undefined
		editor.state.doc.descendants((node, position, parent) => {
			if (node.type.name === 'paragraph' && parent?.type.name === 'mdcSlot') {
				slotParagraphPosition = position
			}
		})
		expect(slotParagraphPosition).toBeDefined()
		if (slotParagraphPosition === undefined) return
		editor.commands.setTextSelection(slotParagraphPosition + 1)

		expect(
			editor.view.dom.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
			),
		).toBe(false)
		expect(
			editor
				.getJSON()
				.content?.map((node) => node.type)
				.slice(0, 3),
		).toEqual(['mdcBlock', 'paragraph', 'table'])
		expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
		expect(editor.state.selection.$from.depth).toBe(1)
		editor.destroy()
	})

	it('keeps an empty MDC slot when Backspace is pressed inside it', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '::Hero\n#title\n\n::',
			contentType: 'markdown',
		})
		let slotParagraphPosition: number | undefined
		editor.state.doc.descendants((node, position, parent) => {
			if (node.type.name === 'paragraph' && parent?.type.name === 'mdcSlot') {
				slotParagraphPosition = position
			}
		})
		expect(slotParagraphPosition).toBeDefined()
		if (slotParagraphPosition === undefined) return
		editor.commands.setTextSelection(slotParagraphPosition + 1)
		editor.commands.keyboardShortcut('Backspace')

		expect(editor.getJSON().content?.[0]).toMatchObject({
			type: 'mdcBlock',
			content: [
				{
					type: 'mdcSlot',
					attrs: { name: 'title' },
					content: [{ type: 'paragraph' }],
				},
			],
		})
		editor.destroy()
	})

	it('edits a selected link and rejects unsafe URLs', () => {
		const editor = createEditor('<p>Hello world</p>')
		editor.commands.setTextSelection({ from: 1, to: 6 })

		expect(
			saveLinkSelection(
				editor,
				{ url: 'https://example.com', title: 'Example', text: 'Hello' },
				{ from: 1, to: 6 },
			),
		).toBe(true)
		expect(readLinkSelection(editor).url).toBe('https://example.com')
		expect(
			saveLinkSelection(
				editor,
				{ url: 'javascript:alert(1)', title: '', text: 'Hello' },
				{ from: 1, to: 6 },
			),
		).toBe(false)
		editor.destroy()
	})

	it('inserts metadata components as generic MDC nodes with named slots', () => {
		const editor = new Editor({
			extensions: [StarterKit, MdcBlock, MdcInline, MdcSlot, Markdown],
		})
		editor.commands.setContent('<p>Before</p>')

		expect(
			insertComponent(editor, {
				name: 'Hero',
				label: 'Hero',
				props: {},
				slots: ['title', 'description'],
			}),
		).toBe(true)
		expect(editor.getJSON()).toMatchObject({
			content: [
				{},
				{
					type: 'mdcBlock',
					attrs: { name: 'Hero' },
					content: [
						{ type: 'mdcSlot', attrs: { name: 'title' } },
						{ type: 'mdcSlot', attrs: { name: 'description' } },
					],
				},
				{},
			],
		})
		editor.destroy()
	})

	it('separates populated MDC slot content from the next slot marker', () => {
		const editor = new Editor({
			extensions: [StarterKit, MdcBlock, MdcInline, MdcSlot, Markdown],
			contentType: 'markdown',
		})
		editor.commands.setContent({
			type: 'doc',
			content: [
				{
					type: 'mdcBlock',
					attrs: { name: 'Hero', props: {}, depth: 2, propsFormat: 'inline' },
					content: [
						{
							type: 'mdcSlot',
							attrs: { name: 'title' },
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'My hero' }] },
							],
						},
						{
							type: 'mdcSlot',
							attrs: { name: 'description' },
							content: [
								{
									type: 'paragraph',
									content: [{ type: 'text', text: 'My description' }],
								},
							],
						},
					],
				},
			],
		})

		expect(editor.getMarkdown()).toContain('#title\nMy hero\n#description')
		editor.destroy()
	})

	it('serializes empty MDC slots exactly once', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '::Hero\n#title\n#description\n\n::',
			contentType: 'markdown',
		})
		const markdown = editor.getMarkdown()

		expect(markdown.match(/^#title$/gmu)).toHaveLength(1)
		expect(markdown.match(/^#description$/gmu)).toHaveLength(1)
		editor.destroy()
	})

	it('restores persisted MDC slots without nesting later components', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: `::Hero{theme="light"}\n#title\n#description\n\n::\n\n::Callout\n#default\n\n::`,
			contentType: 'markdown',
		})
		const blocks = editor.getJSON().content?.filter((node) => node.type === 'mdcBlock')

		expect(blocks).toHaveLength(2)
		expect(blocks).toMatchObject([
			{
				content: [{ attrs: { name: 'title' } }, { attrs: { name: 'description' } }],
			},
			{ content: [{ attrs: { name: 'default' } }] },
		])
		expect(() =>
			editor.commands.setContent(
				`::Hero{theme="light"}\n#title\n#description\n\n::\n\n::Callout\n#default\n\n::`,
				{ contentType: 'markdown', emitUpdate: false },
			),
		).not.toThrow()
		editor.destroy()
	})

	it('persists video media as a video node', () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '<video src="/assets/video-id" controls></video>',
			contentType: 'markdown',
		})

		expect(editor.getJSON().content).toContainEqual({
			type: 'video',
			attrs: { src: '/assets/video-id' },
		})
		expect(editor.getMarkdown()).toContain('<video src="/assets/video-id" controls></video>')
		editor.destroy()
	})

	it('sanitizes image URLs and creates portable Directus asset paths', () => {
		expect(sanitizeImageUrl('https://example.com/image.png')).toBe(
			'https://example.com/image.png',
		)
		expect(sanitizeImageUrl('/assets/file-id')).toBe('/assets/file-id')
		expect(sanitizeImageUrl('javascript:alert(1)')).toBeUndefined()
		expect(sanitizeImageUrl('data:image/png;base64,unsafe')).toBeUndefined()
		expect(directusAssetUrl('abc-123')).toBe('/assets/abc-123')
		expect(directusAssetUrl('bad/id')).toBeUndefined()
	})

	it('filters slash commands by alternate names and component names', () => {
		const openImage = vi.fn()
		const openVideo = vi.fn()
		const editor = createEditor()
		const items = createSlashItems(
			[
				{
					name: 'CalloutBox',
					label: 'Callout',
					description: 'Important content',
					props: {},
					slots: ['default'],
				},
			],
			{ openImage, openVideo },
		)

		expect(filterSlashItems(items, 'ul').map((item) => item.id)).toContain('bullet-list')
		expect(filterSlashItems(items, 'separator').map((item) => item.id)).toContain(
			'horizontal-rule',
		)
		expect(filterSlashItems(items, 'calloutbox').map((item) => item.id)).toEqual([
			'component:CalloutBox',
		])
		expect(filterSlashItems(items, 'photo').map((item) => item.id)).toEqual(['insert-image'])
		expect(filterSlashItems(items, 'media').map((item) => item.id)).toEqual(['insert-video'])
		expect(items.find((item) => item.id === 'insert-image')?.command(editor)).toBe(true)
		expect(items.find((item) => item.id === 'insert-video')?.command(editor)).toBe(true)
		expect(openImage).toHaveBeenCalledOnce()
		expect(openVideo).toHaveBeenCalledOnce()
		expect(items.find((item) => item.id === 'heading-1')).toMatchObject({
			group: 'Text',
			aliases: expect.arrayContaining(['h1']),
		})
		editor.destroy()
	})

	it('filters every control surface through the shared tool configuration', () => {
		const commands = filterEditorCommands(createEditorCommands(), ['bold', 'history', 'table'])
		const ids = commands.map((command) => command.id)

		expect(ids).toContain('bold')
		expect(ids).toContain('undo')
		expect(ids).toContain('insert-table')
		expect(ids).toContain('delete-column')
		expect(ids).not.toContain('italic')
		expect(isEditorToolEnabled(['source'], 'source')).toBe(true)
		expect(isEditorToolEnabled(['source'], 'component')).toBe(false)
		expect(editorToolOptions.map((option) => option.text)).toEqual(
			expect.arrayContaining(['Heading 6', 'Video / media', 'Undo / redo', 'Edit source']),
		)
	})

	it('duplicates, reorders, and deletes top-level blocks', () => {
		const editor = createEditor('<p>One</p><p>Two</p><p>Three</p>')
		const secondPosition = editor.state.doc.child(0).nodeSize

		expect(duplicateBlock(editor, secondPosition)).toBe(true)
		expect(editor.getText({ blockSeparator: '|' })).toBe('One|Two|Two|Three')
		expect(moveBlockUp(editor, secondPosition)).toBe(true)
		expect(editor.getText({ blockSeparator: '|' })).toBe('Two|One|Two|Three')
		const firstSize = editor.state.doc.child(0).nodeSize
		expect(moveBlockDown(editor, 0)).toBe(true)
		expect(editor.getText({ blockSeparator: '|' })).toBe('One|Two|Two|Three')
		expect(deleteBlock(editor, firstSize)).toBe(true)
		expect(editor.getText({ blockSeparator: '|' })).toBe('One|Two|Three')
		editor.destroy()
	})
})
