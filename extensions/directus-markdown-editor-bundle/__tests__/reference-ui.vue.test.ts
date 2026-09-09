// @vitest-environment happy-dom

import type { ReferenceOccurrence } from '../src/markdown-editor-interface/reference/editor'

import { computed, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import EditorContextMenus from '../src/markdown-editor-interface/components/EditorContextMenus.vue'
import ReferenceController from '../src/markdown-editor-interface/components/ReferenceController.vue'
import ReferenceDrawer from '../src/markdown-editor-interface/components/ReferenceDrawer.vue'
import ReferencePicker from '../src/markdown-editor-interface/components/ReferencePicker.vue'
import ReferenceReport from '../src/markdown-editor-interface/components/ReferenceReport.vue'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'
import { collectReferenceOccurrences } from '../src/markdown-editor-interface/reference/editor'

const directusMocks = vi.hoisted(() => ({ get: vi.fn(), collection: undefined as unknown }))

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => ({ get: directusMocks.get }),
	useExtensions: () => ({ interfaces: shallowRef([]) }),
	useStores: () => ({
		useCollectionsStore: () => ({ getCollection: () => directusMocks.collection }),
		useFieldsStore: () => ({
			getFieldsForCollection: () => [
				{
					field: 'id',
					type: 'integer',
					schema: { is_primary_key: true },
					meta: null,
				},
				{ field: 'title', type: 'string', schema: {}, meta: null },
				{ field: 'archived', type: 'boolean', schema: {}, meta: null },
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
	directusMocks.collection = undefined
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

	it('shows a compact source summary and keeps the default drawer actions', () => {
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
		expect(element.querySelector('.reference-drawer__source-actions')?.textContent).toBe(
			'Change source',
		)
		expect(element.querySelector('header')?.textContent).toBe('Delete referenceApply')
	})

	it('shows loading on the item refresh action', () => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			refreshing: true,
			status: 'outdated',
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

	it('only shows refresh beside Change source for outdated references', () => {
		const current = mount(ReferenceDrawer, {
			modelValue: true,
			status: 'valid',
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: {},
			},
		})
		expect(current.querySelector('[aria-label="Refresh item"]')).toBeNull()

		const outdated = mount(ReferenceDrawer, {
			modelValue: true,
			status: 'outdated',
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: {},
			},
		})
		const actions = outdated.querySelector('.reference-drawer__source-actions')
		expect(actions?.textContent).toContain('Change source')
		expect(actions?.querySelector('[aria-label="Refresh item"]')).not.toBeNull()
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

	it.each([
		['unconfigured', 'not configured for this field'],
		['not_available', 'may have been removed'],
		['verification_error', 'could not be verified'],
		['malformed', 'invalid source data'],
	])('explains the %s drawer state', (status, message) => {
		const element = mount(ReferenceDrawer, {
			modelValue: true,
			status,
			reference: {
				collection: 'articles',
				item: 7,
				label: 'A useful article',
				data: {},
			},
		})

		expect(element.querySelector('.reference-drawer__notice')?.textContent).toContain(message)
		expect(element.querySelector('[aria-label="Refresh item"]')).toBeNull()
	})

	it('clears the outdated drawer state after refreshing the source', async () => {
		directusMocks.get.mockClear()
		directusMocks.get.mockResolvedValue({ data: { data: [{ id: 7, title: 'Current item' }] } })
		const editor = new Editor({
			content: ':Reference{collection="articles" :item="7" label="Stale item" :data="{}"}',
			contentType: 'markdown',
			extensions: createEditorExtensions(),
		})
		editors.push(editor)
		const element = mount(ReferenceController, {
			editor,
			collections: [{ collection: 'articles', displayField: 'title' }],
			mode: 'detect',
		})
		await vi.waitFor(() => expect(directusMocks.get).toHaveBeenCalled())
		const occurrence = collectReferenceOccurrences(editor.state.doc)[0]
		if (!occurrence) throw new Error('Expected a reference occurrence.')
		editor.view.dom.dispatchEvent(
			new CustomEvent('markdown-editor-edit-reference', {
				detail: { position: occurrence.position },
			}),
		)
		await nextTick()
		await vi.waitFor(() =>
			expect(element.querySelector('.reference-drawer__notice')).not.toBeNull(),
		)
		element
			.querySelector('[aria-label="Refresh item"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		await vi.waitFor(() =>
			expect(element.querySelector('.reference-drawer__notice')).toBeNull(),
		)
		expect(editor.getMarkdown()).toContain('label="Current item"')
	})

	it('keeps duplicate reference drawer states occurrence-specific after refresh', async () => {
		directusMocks.get.mockClear()
		directusMocks.get.mockResolvedValue({ data: { data: [{ id: 7, title: 'Current item' }] } })
		const stale = ':Reference{collection="articles" :item="7" label="Stale item" :data="{}"}'
		const editor = new Editor({
			content: `${stale} and ${stale}`,
			contentType: 'markdown',
			extensions: createEditorExtensions(),
		})
		editors.push(editor)
		const element = mount(ReferenceController, {
			editor,
			collections: [{ collection: 'articles', displayField: 'title' }],
			mode: 'detect',
		})
		await vi.waitFor(() => expect(directusMocks.get).toHaveBeenCalled())
		const occurrences = collectReferenceOccurrences(editor.state.doc)
		const first = occurrences[0]
		const second = occurrences[1]
		if (!first || !second) throw new Error('Expected duplicate reference occurrences.')

		editor.view.dom.dispatchEvent(
			new CustomEvent('markdown-editor-edit-reference', {
				detail: { position: first.position },
			}),
		)
		await vi.waitFor(() =>
			expect(element.querySelector('.reference-drawer__notice')).not.toBeNull(),
		)
		element
			.querySelector('[aria-label="Refresh item"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await vi.waitFor(() =>
			expect(element.querySelector('.reference-drawer__notice')).toBeNull(),
		)

		editor.view.dom.dispatchEvent(
			new CustomEvent('markdown-editor-edit-reference', {
				detail: { position: second.position },
			}),
		)
		await vi.waitFor(() =>
			expect(element.querySelector('.reference-drawer__notice')).not.toBeNull(),
		)
		expect(element.querySelector('[aria-label="Refresh item"]')).not.toBeNull()
		const refreshed = collectReferenceOccurrences(editor.state.doc)
		expect(refreshed[0]?.reference?.label).toBe('Current item')
		expect(refreshed[1]?.reference?.label).toBe('Stale item')
	})

	it('renders report issues as a table and resolved issues as a success state', () => {
		const occurrence: ReferenceOccurrence = {
			key: '1:0',
			position: 1,
			rawProps: {},
			reference: { collection: 'articles', item: 7, label: 'Article seven', data: {} },
			current: { collection: 'articles', item: 7, label: 'Updated seven', data: {} },
			state: 'outdated',
			sourceState: 'available',
			snapshotState: 'outdated',
		}
		const table = mount(ReferenceReport, { modelValue: true, occurrences: [occurrence] })

		expect(table.querySelector('table')).not.toBeNull()
		expect(table.querySelector('th')?.textContent).toBe('Item')
		expect(table.querySelector('[aria-label="Refresh reference"]')).not.toBeNull()
		expect(table.querySelector('[aria-label="Replace reference"]')).not.toBeNull()
		expect(table.querySelector('[aria-label="Remove reference"]')).not.toBeNull()
		expect(table.querySelector('.reference-report__status')?.textContent).toBe('Outdated')
		expect(table.querySelector('.reference-report__status--warning')).not.toBeNull()
		expect(table.querySelector('.reference-report__header')?.textContent).toContain(
			'need attention',
		)
		expect(table.querySelector('.reference-report__body table')).not.toBeNull()
		expect(table.querySelector('.reference-report__footer')?.textContent).toContain('Close')
		expect(table.querySelectorAll('colgroup col')).toHaveLength(4)

		const success = mount(ReferenceReport, { modelValue: true, occurrences: [] })
		expect(success.querySelector('[role="status"]')?.textContent).toContain(
			'All references are resolved',
		)
		expect(success.textContent).toContain('continue editing the item')
	})

	it('presents archived references without offering refresh', () => {
		const reference = { collection: 'articles', item: 7, label: 'Archived article', data: {} }
		const drawer = mount(ReferenceDrawer, {
			modelValue: true,
			status: 'archived',
			reference,
		})
		expect(drawer.querySelector('.reference-drawer__notice')?.textContent).toContain(
			'This referenced item is archived',
		)
		expect(drawer.querySelector('[aria-label="Refresh item"]')).toBeNull()

		const report = mount(ReferenceReport, {
			modelValue: true,
			occurrences: [
				{
					key: '1:0',
					position: 1,
					rawProps: reference,
					reference,
					state: 'archived',
					sourceState: 'archived',
					snapshotState: 'outdated',
				},
			],
		})
		expect(report.querySelector('.reference-report__status')?.textContent).toBe('Archived')
		expect(report.querySelector('[role="tooltip"]')?.textContent).toContain(
			'archived in Directus',
		)
		expect(report.querySelector('[aria-label="Refresh reference"]')).toBeNull()
		expect(report.querySelector('[aria-label="Replace reference"]')).not.toBeNull()
		expect(report.querySelector('[aria-label="Remove reference"]')).not.toBeNull()
	})

	it.each([
		['outdated', 'changed since your last edit'],
		['archived', 'archived in Directus'],
		['not_available', 'removed or you may no longer have access'],
		['verification_error', 'could not be verified'],
		['unconfigured', 'not configured for this field'],
		['malformed', 'invalid source data'],
	] as const)('provides the %s report hint as a tooltip', (state, hint) => {
		const reference = { collection: 'articles', item: 7, label: 'Article', data: {} }
		const report = mount(ReferenceReport, {
			modelValue: true,
			occurrences: [
				{
					key: '1:0',
					position: 1,
					rawProps: reference,
					reference,
					state,
					sourceState: state === 'archived' ? 'archived' : 'available',
					snapshotState: state === 'outdated' ? 'outdated' : 'unchecked',
				},
			],
		})
		const chip = report.querySelector('.reference-report__status')
		const tooltip = report.querySelector('[role="tooltip"]')
		expect(tooltip?.textContent).toContain(hint)
		expect(chip?.getAttribute('aria-describedby')).toBe(tooltip?.id)
		expect(
			report.querySelector('.reference-report__status-tooltip')?.getAttribute('tabindex'),
		).toBe('0')
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
