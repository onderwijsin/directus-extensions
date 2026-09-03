// @vitest-environment happy-dom
import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { createEditorCommands } from '../src/editor/commands'
import { ClearMarksOnEnter } from '../src/editor/enter'
import { createEditorExtensions } from '../src/editor/extensions'
import { insertComponent } from '../src/editor/insertion'
import { readLinkSelection, saveLinkSelection } from '../src/editor/link'
import { directusAssetUrl, sanitizeImageUrl } from '../src/editor/media'
import { MdcBlock, MdcInline, MdcSlot } from '../src/markdown'

function createEditor(content = '<p>Hello world</p>') {
	return new Editor({ extensions: [StarterKit], content })
}

describe('editor commands', () => {
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
})
