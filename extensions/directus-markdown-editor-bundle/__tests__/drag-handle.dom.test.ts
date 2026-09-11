import { describe, expect, it, vi } from 'vitest'

import { getDragHandleOffset } from '../src/markdown-editor-interface/editor/drag-handle'

function elementWithHeight(tag: string, height: number): HTMLElement {
	const element = document.createElement(tag)
	document.body.appendChild(element)
	vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
		bottom: height,
		height,
		left: 0,
		right: 0,
		top: 0,
		width: 0,
		x: 0,
		y: 0,
		toJSON: () => undefined,
	})
	return element
}

describe('getDragHandleOffset', () => {
	it('centers text-block controls on the first line regardless of total block height', () => {
		const rail = elementWithHeight('div', 34)
		const singleLine = elementWithHeight('p', 22)
		const multipleLines = elementWithHeight('p', 88)
		singleLine.style.fontSize = '14px'
		singleLine.style.lineHeight = '22px'
		multipleLines.style.fontSize = '14px'
		multipleLines.style.lineHeight = '22px'

		expect(getDragHandleOffset({ isTextblock: true, node: singleLine, rail })).toBe(-6)
		expect(getDragHandleOffset({ isTextblock: true, node: multipleLines, rail })).toBe(-6)
	})

	it('uses the text block line height and top inset for differently sized headings', () => {
		const rail = elementWithHeight('div', 34)
		const heading = elementWithHeight('h1', 49)
		heading.style.fontSize = '32px'
		heading.style.lineHeight = '41px'
		heading.style.paddingTop = '4px'

		expect(getDragHandleOffset({ isTextblock: true, node: heading, rail })).toBe(7.5)
	})

	it('leaves container and atomic blocks aligned to the top', () => {
		const rail = elementWithHeight('div', 34)
		const container = elementWithHeight('blockquote', 120)

		expect(getDragHandleOffset({ isTextblock: false, node: container, rail })).toBeNull()
	})
})
