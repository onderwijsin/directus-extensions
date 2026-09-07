// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownEditorOptions } from '../src/index'
import MarkdownEditor from '../src/MarkdownEditor.vue'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

function registerDirectusPrimitives(app: ReturnType<typeof createApp>) {
	app.component(
		'VButton',
		defineComponent({
			inheritAttrs: false,
			template: '<button v-bind="$attrs"><slot /></button>',
		}),
	)
	app.component(
		'VIcon',
		defineComponent({ props: ['name'], template: '<i :data-icon="name" />' }),
	)
	app.component(
		'VSelect',
		defineComponent({
			props: ['modelValue', 'items'],
			template:
				'<select :value="modelValue"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.text }}</option></select>',
		}),
	)
	app.component(
		'VMenu',
		defineComponent({ template: '<div><slot name="activator" /><div><slot /></div></div>' }),
	)
	app.component('VList', defineComponent({ template: '<div><slot /></div>' }))
	app.component(
		'VListItem',
		defineComponent({
			template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
		}),
	)
	app.component('VListItemIcon', defineComponent({ template: '<span><slot /></span>' }))
	app.component('VListItemContent', defineComponent({ template: '<span><slot /></span>' }))
	app.component('VDivider', defineComponent({ template: '<hr />' }))
	app.component(
		'VDrawer',
		defineComponent({
			props: ['modelValue'],
			template:
				'<aside v-if="modelValue"><slot /><slot name="actions" /><slot name="actions:primary" /></aside>',
		}),
	)
	app.component(
		'VDialog',
		defineComponent({
			props: ['modelValue'],
			template: '<div v-if="modelValue"><slot /></div>',
		}),
	)
	app.component('VCard', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VCardTitle', defineComponent({ template: '<h2><slot /></h2>' }))
	app.component('VCardText', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VCardActions', defineComponent({ template: '<div><slot /></div>' }))
	app.component(
		'VInput',
		defineComponent({ props: ['modelValue'], template: '<input :value="modelValue" />' }),
	)
	app.component(
		'VCheckbox',
		defineComponent({
			props: ['modelValue', 'label'],
			template: '<label><input type="checkbox" :checked="modelValue" />{{ label }}</label>',
		}),
	)
	app.component('VUpload', defineComponent({ template: '<div />' }))
	app.component('VNotice', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VProgressCircular', defineComponent({ template: '<div />' }))
	app.component('VChip', defineComponent({ template: '<span><slot /></span>' }))
}

function mountEditor(initialValue = '# Hello', disabled = false, tools?: string[]) {
	const value = shallowRef<string | null>(initialValue)
	const input = vi.fn()
	const root = defineComponent({
		setup: () => () =>
			h(MarkdownEditor, { value: value.value, disabled, tools, onInput: input }),
	})
	const element = document.createElement('div')
	document.body.appendChild(element)
	const app = createApp(root)
	registerDirectusPrimitives(app)
	app.mount(element)
	mounted.push({ app, element })
	return { element, value, input }
}

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.app.unmount()
		entry.element.remove()
	}
})

describe('Markdown editor interface', () => {
	it('exposes a Directus multiselect for all configurable tools', () => {
		const options = createMarkdownEditorOptions()
		const tools = options.find((option) => option.field === 'tools')

		expect(tools).toMatchObject({
			type: 'json',
			meta: {
				interface: 'select-multiple-dropdown',
				options: { allowNone: true },
			},
			schema: { default_value: ['all'] },
		})
		expect(tools?.meta?.options?.choices).toEqual(
			expect.arrayContaining([
				{ text: 'All tools', value: 'all' },
				{ text: 'Heading 1', value: 'heading-1' },
				{ text: 'Edit source', value: 'source' },
			]),
		)
	})

	it('renders Markdown and the complete Directus-native toolbar', async () => {
		const { element } = mountEditor()
		await nextTick()
		await nextTick()

		expect(element.querySelector('[role="textbox"]')?.textContent).toBe('Hello')
		expect(element.querySelector('[role="toolbar"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Block type"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Bold"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Insert component"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Edit Markdown source"]')).not.toBeNull()
		expect(element.querySelector('.editor-toolbar__action-group')).not.toBeNull()
		expect(element.querySelector('.editor-toolbar__special-group')).not.toBeNull()
	})

	it('only renders tools enabled by the interface configuration', async () => {
		const { element } = mountEditor('Configurable', false, ['paragraph', 'bold', 'source'])
		await nextTick()
		await nextTick()

		expect(element.querySelector('[aria-label="Bold"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Edit Markdown source"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Italic"]')).toBeNull()
		expect(element.querySelector('[aria-label="Insert image"]')).toBeNull()
		expect(element.querySelector('[aria-label="Insert component"]')).toBeNull()
	})

	it('re-synchronizes an external Markdown value without emitting an input update', async () => {
		const { element, value, input } = mountEditor('Initial')
		await nextTick()
		await nextTick()
		value.value = 'Updated **value**'
		await nextTick()
		await nextTick()

		expect(element.querySelector('[role="textbox"]')?.textContent).toBe('Updated value')
		expect(element.querySelector('[role="textbox"] strong')?.textContent).toBe('value')
		expect(input).not.toHaveBeenCalled()
	})

	it('propagates disabled state to the editor and toolbar', async () => {
		const { element } = mountEditor('Read only', true)
		await nextTick()
		await nextTick()

		expect(element.querySelector('[role="textbox"]')?.getAttribute('contenteditable')).toBe(
			'false',
		)
		expect(element.querySelector('[aria-label="Bold"]')?.hasAttribute('disabled')).toBe(true)
	})

	it('opens the metadata-driven component picker from the toolbar', async () => {
		const { element } = mountEditor()
		await Promise.resolve()
		await nextTick()
		await nextTick()

		const button = element.querySelector('[aria-label="Insert component"]')
		button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()

		expect(element.textContent).toContain('Insert component')
		expect(element.textContent).toContain('Hero')
		expect(element.textContent).toContain('Callout')
	})

	it('renders persisted MDC as a polished component view and opens its settings', async () => {
		const { element } = mountEditor('::Callout{tone="warning"}\n#default\nContent\n::')
		await nextTick()
		await nextTick()

		expect(element.textContent).not.toContain('MDC component')
		expect(element.textContent).toContain('tone="warning"')
		expect(element.textContent).not.toContain('1 props')
		expect(element.textContent).not.toContain('1 slots')
		expect(element.querySelector('[aria-label="Component actions"]')).not.toBeNull()
		expect(element.querySelector('.mdc-slot-view__content')?.getAttribute('tabindex')).toBe('0')
		expect(element.textContent).not.toContain('Apply')

		const settings = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Settings',
		)
		settings?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()

		expect(element.textContent).toContain('Apply')
		expect(element.textContent).toContain('warning')
		expect(element.textContent).not.toContain('Highlighted supporting content.')
		expect(element.textContent).not.toContain('Slots:')
	})

	it('replaces mounted MDC node views safely when Directus supplies a saved value', async () => {
		const { element, value } = mountEditor('::Callout\n#default\nBefore\n::')
		await nextTick()
		await nextTick()

		value.value = '::Hero\n#title\nAfter\n::'
		await nextTick()
		await nextTick()

		expect(element.textContent).toContain('Hero')
		expect(element.textContent).toContain('After')
		expect(element.textContent).not.toContain('Before')
	})

	it('renders Shiki code with editable language, filename, and collapse settings', async () => {
		const { element } = mountEditor(
			'::code-collapse\n\n```ts [app/nuxt.config.ts]\nconst enabled = true\n```\n\n::',
		)
		await nextTick()
		await nextTick()

		expect(element.querySelector<HTMLInputElement>('[aria-label="Code language"]')?.value).toBe(
			'ts',
		)
		expect(
			element.querySelector<HTMLInputElement>('[aria-label="Code filename or path"]')?.value,
		).toBe('app/nuxt.config.ts')
		expect(element.textContent).toContain('Collapsible')
		await vi.waitFor(
			() => {
				expect(element.querySelector('.code-block.shiki')).not.toBeNull()
			},
			{ timeout: 5000 },
		)
	})
})
