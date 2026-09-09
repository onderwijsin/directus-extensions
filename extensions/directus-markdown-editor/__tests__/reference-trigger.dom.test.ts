// @vitest-environment happy-dom

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEditorExtensions } from '../src/editor/extensions'

const editors: Editor[] = []

afterEach(() => {
	for (const editor of editors.splice(0)) editor.destroy()
})

function createReferenceEditor(content = '') {
	const openReference = vi.fn()
	const element = document.createElement('div')
	document.body.appendChild(element)
	const editor = new Editor({
		element,
		content,
		contentType: 'markdown',
		extensions: createEditorExtensions(
			() => [],
			{ openReference },
			() => ['reference'],
		),
	})
	editors.push(editor)
	return { editor, openReference }
}

describe('Reference @ trigger', () => {
	it('consumes an eligible bare @ on Enter and opens at the deleted position', () => {
		const { editor, openReference } = createReferenceEditor()
		editor.chain().focus().insertContent('@').run()
		const trigger = editor.view.dom.querySelector('.reference-trigger')
		expect(trigger?.textContent).toBe('@')
		expect(trigger?.hasAttribute('data-reference-trigger')).toBe(true)
		expect(editor.view.dom.querySelector('.reference-trigger__hint')?.textContent).toBe(
			"Hit 'enter' to reference an item",
		)
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(openReference).toHaveBeenCalledOnce()
		expect(editor.getText()).toBe('')
	})

	it('decorates a selected blank block with the editor hint', () => {
		const { editor } = createReferenceEditor()
		editor.commands.setContent({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
				{ type: 'paragraph' },
			],
		})
		editor.commands.setTextSelection(8)

		const paragraphs = editor.view.dom.querySelectorAll('p')
		expect(paragraphs[1]?.getAttribute('data-placeholder')).toBe(
			"Start writing or type '/' for commands",
		)
	})

	it('uses the minimal placeholder inside nested content', () => {
		const { editor } = createReferenceEditor()
		editor.commands.setContent({
			type: 'doc',
			content: [
				{
					type: 'blockquote',
					content: [{ type: 'paragraph' }],
				},
			],
		})
		editor.commands.setTextSelection(2)

		expect(
			editor.view.dom.querySelector('blockquote p')?.getAttribute('data-placeholder'),
		).toBe('Start writing…')
	})

	it('does not trigger for an email address', () => {
		const { editor, openReference } = createReferenceEditor('user')
		editor.commands.setTextSelection(5)
		editor.commands.insertContent('@')
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(openReference).not.toHaveBeenCalled()
	})

	it('does not consume a trigger while the editor capability is disabled', () => {
		const openReference = vi.fn()
		const editor = new Editor({
			content: '',
			contentType: 'markdown',
			extensions: createEditorExtensions(
				() => [],
				{ openReference, canOpenReference: () => false },
				() => ['reference'],
			),
		})
		editors.push(editor)
		editor.commands.insertContent('@')
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(openReference).not.toHaveBeenCalled()
		expect(editor.getText()).toMatch(/^@/u)
	})

	it('keeps @ as text when Escape cancels the candidate', () => {
		const { editor, openReference } = createReferenceEditor()
		editor.commands.insertContent('@')
		editor.view.dom.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		)
		editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(openReference).not.toHaveBeenCalled()
		expect(editor.getText()).toMatch(/^@/u)
	})
})
