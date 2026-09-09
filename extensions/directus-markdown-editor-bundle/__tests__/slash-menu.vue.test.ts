import type { SlashItem } from '../src/markdown-editor-interface/editor/slash'

// @vitest-environment happy-dom
import { createApp, defineComponent, h } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

import SlashMenu from '../src/markdown-editor-interface/components/SlashMenu.vue'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

function mount(items: SlashItem[], command = vi.fn()) {
	const element = document.createElement('div')
	document.body.appendChild(element)
	const app = createApp(SlashMenu, { items, query: '', command })
	app.component('VIcon', defineComponent({ props: ['name'], template: '<i>{{ name }}</i>' }))
	app.component('VNotice', defineComponent({ template: '<div><slot /></div>' }))
	app.mount(element)
	mounted.push({ app, element })
	return { element, command }
}

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.app.unmount()
		entry.element.remove()
	}
})

function item(id: string, label: string, group: string): SlashItem {
	return {
		id,
		label,
		group,
		description: `${label} description`,
		icon: 'add',
		aliases: [],
		command: () => true,
	}
}

describe('slash menu', () => {
	it('renders grouped commands with accessible option state', () => {
		const { element } = mount([
			item('paragraph', 'Paragraph', 'Text'),
			item('table', 'Table', 'Insert'),
		])

		expect(element.textContent).toContain('Text')
		expect(element.textContent).toContain('Insert')
		expect(element.querySelectorAll('[role="option"]')).toHaveLength(2)
		expect(element.querySelector('[role="option"]')?.getAttribute('aria-selected')).toBe('true')
	})

	it('executes the clicked command item', () => {
		const command = vi.fn()
		const selected = item('paragraph', 'Paragraph', 'Text')
		const { element } = mount([selected], command)

		const button = element.querySelector('button')
		button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		expect(command).toHaveBeenCalledWith(selected)
	})

	it('supports wrapped arrow navigation, boundary keys, Enter, and Escape', async () => {
		const command = vi.fn()
		const first = item('paragraph', 'Paragraph', 'Text')
		const second = item('table', 'Table', 'Insert')
		const { element } = mount([first, second], command)
		const menu = element.querySelector('[role="listbox"]')

		menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
		await Promise.resolve()
		expect(element.querySelectorAll('[role="option"]')[1]?.getAttribute('aria-selected')).toBe(
			'true',
		)
		menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
		menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
		menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(command).toHaveBeenCalledWith(second)
		menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	})

	it('shows the empty state and active query', () => {
		const element = document.createElement('div')
		const app = createApp({
			render: () => h(SlashMenu, { items: [], query: 'missing', command: vi.fn() }),
		})
		app.component('VNotice', defineComponent({ template: '<div><slot /></div>' }))
		app.mount(element)
		mounted.push({ app, element })

		expect(element.textContent).toContain('No commands match “missing”.')
	})
})
