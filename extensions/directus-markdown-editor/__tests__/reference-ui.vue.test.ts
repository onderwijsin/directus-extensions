// @vitest-environment happy-dom

import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EditorContextMenus from '../src/components/EditorContextMenus.vue'
import ReferenceDrawer from '../src/components/ReferenceDrawer.vue'
import ReferencePicker from '../src/components/ReferencePicker.vue'
import { createEditorExtensions } from '../src/editor/extensions'

vi.mock('@directus/extensions-sdk', () => ({
	useExtensions: () => ({ interfaces: shallowRef([]) }),
}))

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []
const editors: Editor[] = []

function registerPrimitives(app: ReturnType<typeof createApp>) {
	app.component('VButton', defineComponent({ template: '<button><slot /></button>' }))
	app.component(
		'VIcon',
		defineComponent({ props: ['name'], template: '<i :data-icon="name" />' }),
	)
	app.component('VList', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VListItem', defineComponent({ template: '<button><slot /></button>' }))
	app.component('VListItemIcon', defineComponent({ template: '<span><slot /></span>' }))
	app.component('VListItemContent', defineComponent({ template: '<span><slot /></span>' }))
	app.component('VDivider', defineComponent({ template: '<hr />' }))
	app.component('VChip', defineComponent({ template: '<span class="chip"><slot /></span>' }))
	app.component('VNotice', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VProgressCircular', defineComponent({ template: '<div />' }))
	app.component('VCard', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VCardTitle', defineComponent({ template: '<h2><slot /></h2>' }))
	app.component('VCardText', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VCardActions', defineComponent({ template: '<div><slot /></div>' }))
	app.component(
		'VDialog',
		defineComponent({
			props: ['modelValue'],
			template: '<div v-if="modelValue"><slot /></div>',
		}),
	)
	app.component(
		'VDrawer',
		defineComponent({
			props: ['modelValue'],
			template:
				'<aside v-if="modelValue"><slot /><header><slot name="actions" /><slot name="actions:primary" /></header></aside>',
		}),
	)
	app.component(
		'VInput',
		defineComponent({
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value || null)" />',
		}),
	)
	app.component(
		'VMenu',
		defineComponent({ template: '<div><slot name="activator" /><slot /></div>' }),
	)
	app.component('DragHandle', defineComponent({ template: '<div><slot /></div>' }))
}

function mount(component: Parameters<typeof h>[0], props: Record<string, unknown>) {
	const element = document.createElement('div')
	document.body.appendChild(element)
	const app = createApp(defineComponent({ setup: () => () => h(component, props) }))
	registerPrimitives(app)
	app.mount(element)
	mounted.push({ app, element })
	return element
}

afterEach(() => {
	vi.useRealTimers()
	for (const entry of mounted.splice(0)) {
		entry.app.unmount()
		entry.element.remove()
	}
	for (const editor of editors.splice(0)) editor.destroy()
})

describe('Reference interface', () => {
	it('accepts a null search value when the input is cleared', async () => {
		vi.useFakeTimers()
		const get = vi.fn()
		const element = mount(ReferencePicker, {
			modelValue: true,
			api: { get },
			collections: [],
		})
		const input = element.querySelector('input')
		if (!(input instanceof HTMLInputElement)) throw new Error('Expected search input.')

		input.value = 'a'
		input.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		input.value = ''
		input.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		await vi.advanceTimersByTimeAsync(250)

		expect(get).not.toHaveBeenCalled()
	})

	it('keeps the collection badge inside the full-width result row', async () => {
		vi.useFakeTimers()
		const get = vi.fn().mockResolvedValue({
			data: { data: [{ id: 1, title: 'Alpha' }] },
		})
		const element = mount(ReferencePicker, {
			modelValue: true,
			api: { get },
			collections: [
				{
					collection: 'articles',
					displayField: 'title',
					searchFields: ['title'],
					dataFields: [],
					primaryKeyField: 'id',
					order: 0,
				},
			],
		})
		const input = element.querySelector('input')
		if (!(input instanceof HTMLInputElement)) throw new Error('Expected search input.')
		input.value = 'Alpha'
		input.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		await vi.advanceTimersByTimeAsync(200)
		await Promise.resolve()
		await nextTick()

		const row = element.querySelector('.reference-picker__result')
		expect(row?.querySelector('.reference-picker__label')?.textContent).toBe('Alpha')
		expect(row?.querySelector('.reference-picker__collection')?.textContent).toBe('articles')
	})

	it('offers Reference but hides unavailable Components in the drag-handle insert menu', () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		editors.push(editor)
		const element = mount(EditorContextMenus, {
			editor,
			commands: [],
			enabledTools: ['reference', 'component'],
			referencesEnabled: true,
			componentsAvailable: false,
		})

		expect(element.textContent).toContain('Reference')
		expect(element.textContent).not.toContain('Component')
	})

	it('shows source data and keeps refresh with the drawer actions', () => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: { slug: 'useful' },
			},
		})

		expect(element.querySelector('[aria-label="Source record"]')?.textContent).toContain(
			'A useful article',
		)
		expect(element.querySelector('.reference-drawer__source-data')?.textContent).toContain(
			'slug',
		)
		expect(element.textContent).not.toContain('Presentation')
		expect(element.querySelector('header')?.textContent).toContain('Refresh source')
	})
})
