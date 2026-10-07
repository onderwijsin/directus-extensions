import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkdownImage } from '../src/markdown-editor-interface/editor/image'

const editors: Editor[] = []

function createEditor(content: string, editable = true) {
	const element = document.createElement('div')
	document.body.appendChild(element)
	const editor = new Editor({
		element,
		editable,
		extensions: [StarterKit, MarkdownImage, Markdown],
		content,
		contentType: 'markdown',
	})
	editors.push(editor)
	return editor
}

afterEach(() => {
	for (const editor of editors.splice(0)) editor.destroy()
	document.body.replaceChildren()
	vi.restoreAllMocks()
})

describe('resizable Markdown images', () => {
	it.each([
		'![Landscape](abc-123){width="420"}',
		'![Landscape](https://example.com/a(b).png "Title"){width="420"}',
		'![Landscape](/assets/abc-123){width="420"}',
	])('restores and round-trips preferred widths: %s', (markdown) => {
		const editor = createEditor(markdown)
		expect(editor.state.doc.firstChild?.attrs).toMatchObject({ width: 420, height: null })
		expect(editor.getMarkdown().trim()).toBe(markdown)
		const reopened = createEditor(editor.getMarkdown())
		expect(reopened.state.doc.firstChild?.attrs.width).toBe(420)
	})

	it('keeps ordinary images full width and preserves surrounding text', () => {
		const editor = createEditor('Before\n\n![Alt](abc-123)\n\nAfter')
		expect(editor.state.doc.child(1).attrs).toMatchObject({ width: null, height: null })
		expect(editor.view.dom.querySelector('img')?.style.width).toBe('100%')
		expect(editor.getMarkdown().trim()).toBe('Before\n\n![Alt](abc-123)\n\nAfter')
	})

	it.each(['0', '-10', 'Infinity', '420px', 'NaN'])('rejects invalid width %s', (width) => {
		const editor = createEditor(`![Alt](abc-123){width="${width}"}`)
		expect(editor.state.doc.firstChild?.attrs.width).toBeNull()
		expect(editor.getMarkdown().trim()).toBe('![Alt](abc-123)')
	})

	it('resizes through native handles, persists width only, and supports undo and updates', () => {
		const editor = createEditor('![Alt](abc-123 "Title")')
		const image = editor.view.dom.querySelector('img')
		const handle = editor.view.dom.querySelector('[data-resize-handle="right"]')
		if (!(image instanceof HTMLImageElement) || !(handle instanceof HTMLElement))
			throw new Error('Missing image resize view')
		expect(image.getAttribute('src')).toBe('/assets/abc-123')
		let measuredWidth = 800
		vi.spyOn(image, 'offsetWidth', 'get').mockImplementation(() => measuredWidth)
		vi.spyOn(image, 'offsetHeight', 'get').mockImplementation(() => measuredWidth / 2)
		handle.dispatchEvent(
			new MouseEvent('mousedown', { clientX: 800, clientY: 400, bubbles: true }),
		)
		document.dispatchEvent(
			new MouseEvent('mousemove', { clientX: 420, clientY: 210, bubbles: true }),
		)
		expect(image.parentElement?.style.width).toBe('420px')
		expect(image.style.height).toBe('auto')
		measuredWidth = 420
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
		expect(editor.state.doc.firstChild?.attrs).toMatchObject({
			src: 'abc-123',
			width: 420,
			height: null,
		})
		expect(editor.getMarkdown().trim()).toBe('![Alt](abc-123 "Title"){width="420"}')
		expect(image.parentElement?.style.maxWidth).toBe('100%')
		editor.commands.undo()
		expect(image.parentElement?.style.width).toBe('100%')
		editor.commands.setNodeSelection(0)
		editor.commands.updateAttributes('image', {
			src: 'new-id',
			alt: 'New',
			title: null,
			width: 200,
		})
		expect(image.getAttribute('src')).toBe('/assets/new-id')
		expect(image.getAttribute('alt')).toBe('New')
		expect(image.hasAttribute('title')).toBe(false)
		expect(image.parentElement?.style.width).toBe('200px')
	})

	it.each([false, true])(
		'previews full width while dragging and snaps only on release (reduced motion: %s)',
		(reducedMotion) => {
			const editor = createEditor('![Alt](abc-123){width="420"}')
			const image = editor.view.dom.querySelector('img')
			const handle = editor.view.dom.querySelector('[data-resize-handle="right"]')
			const container = editor.view.dom.querySelector('[data-resize-container]')
			const wrapper = image?.parentElement
			if (
				!(image instanceof HTMLImageElement) ||
				!(handle instanceof HTMLElement) ||
				!(container instanceof HTMLElement) ||
				!wrapper
			)
				throw new Error('Missing resize view')
			expect(editor.view.dom.querySelectorAll('[data-resize-handle]')).toHaveLength(1)
			vi.spyOn(container, 'clientWidth', 'get').mockReturnValue(800)
			let measuredWidth = 420
			vi.spyOn(image, 'offsetWidth', 'get').mockImplementation(() => measuredWidth)
			vi.spyOn(image, 'offsetHeight', 'get').mockImplementation(() => measuredWidth / 2)
			vi.spyOn(wrapper, 'getBoundingClientRect').mockImplementation(() => ({
				width: measuredWidth,
				height: measuredWidth / 2,
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				right: measuredWidth,
				bottom: measuredWidth / 2,
				toJSON: () => undefined,
			}))
			const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
			vi.spyOn(motion, 'matches', 'get').mockReturnValue(reducedMotion)
			vi.spyOn(window, 'matchMedia').mockReturnValue(motion)
			const cancel = vi.fn()
			const animate = vi.fn(() => ({ cancel, playState: 'running' }))
			Object.defineProperty(wrapper, 'animate', { value: animate })

			handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 420, bubbles: true }))
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 792, bubbles: true }))
			expect(wrapper.style.width).toBe('792px')
			const target = container.querySelector('.markdown-image-snap-target')
			if (!(target instanceof HTMLElement)) throw new Error('Missing snap target')
			expect(target.hidden).toBe(false)
			expect(target.style.height).toBe('400px')
			expect(editor.state.doc.firstChild?.attrs.width).toBe(420)
			expect(animate).not.toHaveBeenCalled()
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 770, bubbles: true }))
			expect(target.hidden).toBe(true)
			expect(wrapper.style.width).toBe('770px')
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 792, bubbles: true }))
			expect(target.hidden).toBe(false)
			expect(animate).not.toHaveBeenCalled()
			measuredWidth = 792
			document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
			expect(editor.state.doc.firstChild?.attrs.width).toBeNull()
			expect(target.hidden).toBe(true)
			expect(wrapper.style.width).toBe('100%')
			expect(editor.getMarkdown().trim()).toBe('![Alt](abc-123)')
			if (!reducedMotion)
				expect(animate).toHaveBeenLastCalledWith(
					[{ width: '792px' }, { width: '800px' }],
					expect.objectContaining({ duration: 140 }),
				)

			measuredWidth = 800
			handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 800, bubbles: true }))
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 785, bubbles: true }))
			expect(wrapper.style.width).toBe('785px')
			expect(target.hidden).toBe(true)
			document.dispatchEvent(new MouseEvent('mousemove', { clientX: 770, bubbles: true }))
			expect(wrapper.style.width).toBe('770px')
			document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
			expect(editor.state.doc.firstChild?.attrs).toMatchObject({ width: 770, height: null })
			expect(editor.getMarkdown().trim()).toBe('![Alt](abc-123){width="770"}')
			if (reducedMotion) expect(animate).not.toHaveBeenCalled()
			else expect(animate).toHaveBeenCalledTimes(1)
		},
	)

	it('retains width in read-only editors', () => {
		const editor = createEditor('![](abc-123){width="420"}', false)
		expect(editor.view.dom.getAttribute('contenteditable')).toBe('false')
		expect(editor.getMarkdown().trim()).toBe('![](abc-123){width="420"}')
	})
})
