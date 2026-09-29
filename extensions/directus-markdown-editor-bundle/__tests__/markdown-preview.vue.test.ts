import { createApp, h, nextTick } from 'vue'

import { afterEach, describe, expect, it } from 'vitest'

import MarkdownPreview from '../src/markdown-editor-interface/components/MarkdownPreview.vue'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.app.unmount()
		entry.element.remove()
	}
})

describe('Markdown preview', () => {
	it('renders Markdown through a non-editable editor without a toolbar', async () => {
		const element = document.createElement('div')
		document.body.append(element)
		const app = createApp({
			render: () =>
				h(MarkdownPreview, {
					content: '# Heading\n\n**Strong text**',
					label: 'Preview',
				}),
		})
		app.mount(element)
		mounted.push({ app, element })
		await nextTick()
		await new Promise((resolve) => setTimeout(resolve, 0))
		await nextTick()

		const heading = element.querySelector('h1')
		expect(heading?.textContent).toBe('Heading')
		expect(element.querySelector('.markdown-editor-content')).not.toBeNull()
		expect(element.querySelector('strong')?.textContent).toBe('Strong text')
		expect(element.querySelector('.ProseMirror')?.getAttribute('contenteditable')).toBe('false')
		expect(element.querySelector('.editor-toolbar')).toBeNull()
	})
})
