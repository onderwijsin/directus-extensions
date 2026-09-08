// @vitest-environment happy-dom
import { computed, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownEditorOptions } from '../src/index'
import MarkdownEditor from '../src/MarkdownEditor.vue'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

function registerDirectusPrimitives(app: ReturnType<typeof createApp>) {
	app.component(
		'VButton',
		defineComponent({
			inheritAttrs: false,
			template: '<button v-bind="$attrs"><span class="content"><slot /></span></button>',
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
			emits: ['update:modelValue'],
			setup: () => ({ toggle: () => undefined }),
			template:
				'<div><slot name="preview" :toggle="toggle" :active="false" /><select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.text }}</option></select></div>',
		}),
	)
	app.component(
		'VMenu',
		defineComponent({
			props: {
				modelValue: { type: Boolean, default: undefined },
				disabled: Boolean,
			},
			emits: ['update:modelValue'],
			setup(props, { emit }) {
				const localValue = shallowRef(false)
				const active = computed(() => props.modelValue ?? localValue.value)
				return {
					active,
					toggle: () => {
						if (props.disabled) return
						const nextActive = !active.value
						localValue.value = nextActive
						emit('update:modelValue', nextActive)
					},
				}
			},
			template:
				'<div><slot name="activator" :toggle="toggle" /><div v-if="active"><slot /></div></div>',
		}),
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
	const disabledValue = shallowRef(disabled)
	const input = vi.fn()
	const root = defineComponent({
		setup: () => () =>
			h(MarkdownEditor, {
				value: value.value,
				disabled: disabledValue.value,
				tools,
				onInput: input,
			}),
	})
	const element = document.createElement('div')
	document.body.appendChild(element)
	const app = createApp(root)
	registerDirectusPrimitives(app)
	app.mount(element)
	mounted.push({ app, element })
	return { element, value, disabled: disabledValue, input }
}

afterEach(() => {
	document.body.classList.remove('dark')
	document.body.removeAttribute('data-theme')
	document.documentElement.classList.remove('dark')
	document.documentElement.removeAttribute('data-theme')
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
				{ text: 'Full screen', value: 'fullscreen' },
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
		expect(element.querySelector('[aria-label="Full screen"]')).not.toBeNull()
		expect(
			element.querySelector('[aria-label="More editor actions"]')?.hasAttribute('disabled'),
		).toBe(false)
		expect(element.querySelector('.editor-toolbar__action-group')).not.toBeNull()
		expect(element.querySelector('.editor-toolbar__special-group')).not.toBeNull()
		expect(
			element
				.querySelector('.editor-block-controls')
				?.parentElement?.classList.contains('editor-block-controls-layer'),
		).toBe(true)
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
		expect(element.querySelector('[aria-label="Full screen"]')).toBeNull()
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
		const { element, disabled } = mountEditor(
			'```ts\nconst locked = true\n```\n\n::Callout{tone="warning"}\n#default\nLocked :Icon{name="lock"}\n::',
			true,
		)
		await nextTick()
		await nextTick()

		expect(element.querySelector('[role="textbox"]')?.getAttribute('contenteditable')).toBe(
			'false',
		)
		expect(element.querySelector('[aria-label="Bold"]')?.hasAttribute('disabled')).toBe(true)
		for (const label of [
			'Code language',
			'Code filename or path',
			'Make code block collapsible',
			'Component actions',
			'Configure Icon component',
			'Edit link',
			'Insert image',
			'Insert video',
			'Insert component',
			'Edit Markdown source',
			'More editor actions',
			'Full screen',
		]) {
			expect(element.querySelector(`[aria-label="${label}"]`)?.hasAttribute('disabled')).toBe(
				true,
			)
		}

		element
			.querySelector('[aria-label="Insert component"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.querySelector('[role="dialog"][aria-label="Insert component"]')).toBeNull()

		disabled.value = false
		await nextTick()
		await nextTick()

		expect(element.querySelector('[role="textbox"]')?.getAttribute('contenteditable')).toBe(
			'true',
		)
		expect(
			element.querySelector('[aria-label="More editor actions"]')?.hasAttribute('disabled'),
		).toBe(false)

		element
			.querySelector('[aria-label="More editor actions"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.textContent).toContain('Divider')
	})

	it('toggles full screen with an inverted icon and exits on Escape', async () => {
		const { element } = mountEditor()
		await nextTick()
		await nextTick()
		const editor = element.querySelector('.markdown-editor')

		element
			.querySelector('[aria-label="Full screen"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(editor?.classList.contains('is-fullscreen')).toBe(true)
		expect(
			element.querySelector('[aria-label="Exit full screen"] [data-icon="fullscreen_exit"]'),
		).not.toBeNull()

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
		await nextTick()
		expect(editor?.classList.contains('is-fullscreen')).toBe(false)
	})

	it('loads Shiki while locked and refreshes when a draft becomes editable', async () => {
		const { element, disabled } = mountEditor('```ts\nconst enabled = true\n```', true)

		await vi.waitFor(
			() => {
				expect(
					element.querySelector('[role="textbox"]')?.getAttribute('contenteditable'),
				).toBe('false')
				expect(element.querySelector('.code-block.shiki code span')).not.toBeNull()
			},
			{ timeout: 5000 },
		)

		disabled.value = false
		await vi.waitFor(() => {
			expect(element.querySelector('[role="textbox"]')?.getAttribute('contenteditable')).toBe(
				'true',
			)
			expect(element.querySelector('.code-block.shiki code span')).not.toBeNull()
		})
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

		element
			.querySelector('[aria-label="Component actions"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
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

	it('opens an inline component directly without a separate settings icon', async () => {
		const { element } = mountEditor('Before :Icon{name="check"} after')
		await nextTick()
		await nextTick()

		const component = element.querySelector('[aria-label="Configure Icon component"]')
		expect(component).not.toBeNull()
		expect(component?.querySelector('[data-icon="tune"]')).toBeNull()
		component?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.textContent).toContain('Apply')
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
		document.body.classList.add('dark')
		const { element, input } = mountEditor(
			'::code-collapse\n\n```ts [app/nuxt.config.ts]\nconst enabled = true\n```\n\n::',
		)
		await nextTick()
		await nextTick()
		expect(element.querySelector('.markdown-editor')?.classList.contains('is-dark')).toBe(true)
		await vi.waitFor(
			() => {
				expect(element.querySelector('.code-block.shiki')).not.toBeNull()
				const token = element.querySelector('.code-block.shiki code span')
				expect(token instanceof HTMLElement ? token.style.color : '').not.toBe('')
			},
			{ timeout: 5000 },
		)
		const collapseContent = element.querySelector(
			'[aria-label="Keep code block expanded"] span.content',
		)
		expect(collapseContent).toBeInstanceOf(HTMLElement)

		document.body.classList.remove('dark')
		await vi.waitFor(() => {
			expect(element.querySelector('.markdown-editor')?.classList.contains('is-dark')).toBe(
				false,
			)
		})

		expect(element.querySelector<HTMLInputElement>('[aria-label="Code language"]')?.value).toBe(
			'TypeScript',
		)
		expect(
			element.querySelector<HTMLInputElement>('[aria-label="Code filename or path"]')?.value,
		).toBe('app/nuxt.config.ts')
		expect(element.querySelector('[aria-label="Keep code block expanded"]')).not.toBeNull()
		expect(element.querySelector('[data-icon="expand_content"]')).not.toBeNull()
		for (const label of [
			'Blockquote',
			'Edit link',
			'Insert image',
			'Insert video',
			'Insert component',
		]) {
			expect(element.querySelector(`[aria-label="${label}"]`)?.hasAttribute('disabled')).toBe(
				true,
			)
		}
		expect(
			element.querySelector('[aria-label="Edit Markdown source"]')?.hasAttribute('disabled'),
		).toBe(false)
		const languageSelect = element.querySelector('.code-block__language select')
		expect(languageSelect).toBeInstanceOf(HTMLSelectElement)
		if (!(languageSelect instanceof HTMLSelectElement)) return
		expect(languageSelect.options.length).toBeGreaterThan(50)
		expect(languageSelect.options.length).toBeLessThan(100)
		languageSelect.value = 'python'
		languageSelect.dispatchEvent(new Event('change', { bubbles: true }))
		await nextTick()

		expect(input.mock.lastCall?.[0]).toContain(
			'```python [app/nuxt.config.ts]\nconst enabled = true\n```',
		)
		await vi.waitFor(() => {
			const token = element.querySelector('.code-block.shiki code span')
			expect(token instanceof HTMLElement ? token.style.color : '').not.toBe('')
		})
	})
})
