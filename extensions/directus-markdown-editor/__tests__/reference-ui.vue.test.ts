// @vitest-environment happy-dom

import type { ReferenceOccurrence } from '../src/reference/editor'

import { computed, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EditorContextMenus from '../src/components/EditorContextMenus.vue'
import ReferenceController from '../src/components/ReferenceController.vue'
import ReferenceDrawer from '../src/components/ReferenceDrawer.vue'
import ReferencePicker from '../src/components/ReferencePicker.vue'
import ReferenceReport from '../src/components/ReferenceReport.vue'
import { createEditorExtensions } from '../src/editor/extensions'

const directusMocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => ({ get: directusMocks.get }),
	useExtensions: () => ({ interfaces: shallowRef([]) }),
	useStores: () => ({
		useFieldsStore: () => ({
			getFieldsForCollection: () => [
				{
					field: 'id',
					type: 'integer',
					schema: { is_primary_key: true },
					meta: null,
				},
				{ field: 'title', type: 'string', schema: {}, meta: null },
			],
		}),
	}),
}))

vi.mock('@tiptap/extension-drag-handle-vue-3', async () => {
	const { defineComponent } = await import('vue')
	return { DragHandle: defineComponent({ template: '<div><slot /></div>' }) }
})

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
		defineComponent({
			props: { modelValue: { type: Boolean, default: undefined } },
			emits: ['update:modelValue'],
			setup(props, { emit }) {
				const localValue = shallowRef(false)
				const active = computed(() => props.modelValue ?? localValue.value)
				return {
					active,
					toggle: () => {
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

	it('keeps the drag-handle menus mutually exclusive and hides unavailable Components', async () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		editors.push(editor)
		const element = mount(EditorContextMenus, {
			editor,
			commands: [],
			enabledTools: ['reference', 'component'],
			referencesEnabled: true,
			componentsAvailable: false,
		})

		element
			.querySelector('[aria-label="Insert block"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.textContent).toContain('Reference')
		expect(element.textContent).not.toContain('Component')

		element
			.querySelector('[aria-label="Drag or open block actions"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.textContent).toContain('Duplicate')
		expect(element.textContent).not.toContain('Reference')
	})

	it('shows a compact source summary and keeps evenly-spaced drawer actions', () => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: { slug: 'useful' },
			},
		})

		expect(element.querySelector('[aria-label="Source item"]')?.textContent).toContain(
			'A useful article',
		)
		expect(element.querySelector('.reference-drawer__source-data')).toBeNull()
		expect(element.textContent).not.toContain('Source record')
		expect(element.textContent).not.toContain('Presentation')
		expect(element.querySelector('header')?.textContent).toContain('Refresh')
	})

	it('shows loading on the item refresh action', () => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			refreshing: true,
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: {},
			},
		})

		expect(element.querySelector('[aria-label="Refresh item"]')?.hasAttribute('loading')).toBe(
			true,
		)
	})

	it('warns in the drawer when the referenced item is outdated', () => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			status: 'outdated',
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: {},
			},
		})

		expect(element.querySelector('.reference-drawer__notice')?.textContent).toContain(
			'has changed since your last edit',
		)
	})

	it('renders report issues as a table and resolved issues as a success state', () => {
		const occurrence: ReferenceOccurrence = {
			key: '1:0',
			position: 1,
			rawProps: {},
			reference: { collection: 'articles', item: 7, label: 'Article seven', data: {} },
			current: { collection: 'articles', item: 7, label: 'Updated seven', data: {} },
			state: 'outdated',
		}
		const table = mount(ReferenceReport, { modelValue: true, occurrences: [occurrence] })

		expect(table.querySelector('table')).not.toBeNull()
		expect(table.querySelector('th')?.textContent).toBe('Item')
		expect(table.querySelector('[aria-label="Refresh reference"]')).not.toBeNull()
		expect(table.querySelector('[aria-label="Replace reference"]')).not.toBeNull()
		expect(table.querySelector('[aria-label="Remove reference"]')).not.toBeNull()
		expect(table.querySelector('.reference-report__status')?.textContent).toBe('Outdated')
		expect(table.querySelector('.reference-report__status--warning')).not.toBeNull()

		const success = mount(ReferenceReport, { modelValue: true, occurrences: [] })
		expect(success.querySelector('[role="status"]')?.textContent).toContain(
			'All references are resolved',
		)
		expect(success.textContent).toContain('continue editing the item')
	})

	it('replaces a stale reference through the picker and returns to report success', async () => {
		directusMocks.get.mockResolvedValue({ data: { data: [{ id: 7, title: 'Current item' }] } })
		const editor = new Editor({
			content: ':Reference{collection="articles" :item="7" label="Stale item" :data="{}"}',
			contentType: 'markdown',
			extensions: createEditorExtensions(),
		})
		editors.push(editor)
		const Host = defineComponent({
			setup() {
				const reportOpen = shallowRef(false)
				const needsAttention = shallowRef(false)
				function setReportOpen(value: boolean) {
					reportOpen.value = value
				}
				function setNeedsAttention(value: boolean) {
					needsAttention.value = value
				}
				return () =>
					h('div', [
						needsAttention.value
							? h(
									'button',
									{ class: 'show-report', onClick: () => setReportOpen(true) },
									'Show report',
								)
							: undefined,
						h(ReferenceController, {
							editor,
							collections: [{ collection: 'articles', displayField: 'title' }],
							mode: 'detect',
							reportOpen: reportOpen.value,
							'onUpdate:reportOpen': setReportOpen,
							onAttentionChange: setNeedsAttention,
						}),
					])
			},
		})
		const element = mount(Host, {})
		await vi.waitFor(() => {
			expect(element.querySelector('.show-report')).not.toBeNull()
		})
		expect(element.querySelector('[aria-label="Reference report"]')).toBeNull()
		element
			.querySelector('.show-report')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.querySelector('[aria-label="Replace reference"]')).not.toBeNull()

		element
			.querySelector('[aria-label="Replace reference"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.querySelector('[aria-label="Reference report"]')).toBeNull()
		const input = element.querySelector('[aria-label="Search items"]')
		if (!(input instanceof HTMLInputElement)) throw new Error('Expected item search input.')
		input.value = 'Current'
		input.dispatchEvent(new Event('input', { bubbles: true }))
		await new Promise((resolve) => window.setTimeout(resolve, 225))
		await nextTick()
		element
			.querySelector('.reference-picker__result')
			?.closest('button')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()

		expect(editor.getMarkdown()).toContain('label="Current item"')
		expect(element.querySelector('[role="status"]')?.textContent).toContain(
			'All references are resolved',
		)
	})
})
