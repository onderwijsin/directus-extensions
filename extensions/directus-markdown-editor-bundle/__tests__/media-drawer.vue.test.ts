// @vitest-environment happy-dom

import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MediaDrawer from '../src/markdown-editor-interface/components/drawers/MediaDrawer.vue'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'

const get = vi.hoisted(() => vi.fn())
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get }) }))
const cleanup: (() => void)[] = []

function mount(existing = false) {
	const editor = new Editor({ extensions: createEditorExtensions() })
	if (existing) {
		editor.commands.insertContent({
			type: 'image',
			attrs: { src: '/assets/a', alt: 'Stored alt' },
		})
		editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'image') editor.commands.setNodeSelection(position)
		})
	}
	const open = shallowRef(true)
	let selection: unknown = { id: 'a' }
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(
		defineComponent({
			setup: () => () =>
				h(MediaDrawer, {
					editor,
					modelValue: open.value,
					'onUpdate:modelValue': (value: boolean) => {
						open.value = value
					},
				}),
		}),
	)
	app.component(
		'VDrawer',
		defineComponent({
			props: ['modelValue'],
			template:
				'<aside v-if="modelValue"><slot/><slot name="actions"/><slot name="actions:primary"/></aside>',
		}),
	)
	app.component('VButton', defineComponent({ template: '<button><slot/></button>' }))
	app.component('VIcon', defineComponent({ template: '<i/>' }))
	app.component(
		'VInput',
		defineComponent({
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>',
		}),
	)
	app.component(
		'VUpload',
		defineComponent({
			emits: ['input'],
			setup:
				(_, { emit }) =>
				() =>
					h(
						'button',
						{ class: 'select', onClick: () => emit('input', selection) },
						'Select',
					),
		}),
	)
	app.mount(element)
	cleanup.push(() => {
		app.unmount()
		element.remove()
		editor.destroy()
	})
	return {
		element,
		editor,
		open,
		app,
		alt: () => element.querySelector<HTMLInputElement>('input')?.value,
		waiting: () => Boolean(element.querySelector('[role="status"]')),
		select: async (value: unknown) => {
			selection = value
			element.querySelector<HTMLButtonElement>('.select')?.click()
			await nextTick()
		},
		type: async (value: string) => {
			const input = element.querySelector<HTMLInputElement>('input')
			if (!input) throw new Error('Missing alt input')
			input.value = value
			input.dispatchEvent(new Event('input', { bubbles: true }))
			await nextTick()
		},
		save: () =>
			[...element.querySelectorAll('button')]
				.find((button) => button.textContent === 'Save Image')
				?.click(),
	}
}

beforeEach(() => {
	vi.useFakeTimers()
	get.mockReset()
	get.mockResolvedValue({ data: { data: { id: 'a', description: null } } })
})
afterEach(() => {
	cleanup.splice(0).forEach((dispose) => dispose())
	vi.useRealTimers()
})

describe('image alt defaults', () => {
	it('applies trimmed library descriptions and replaces untouched automatic text', async () => {
		const drawer = mount()
		await drawer.select([{ id: 'a', description: ' A description ' }])
		expect(drawer.alt()).toBe('A description')
		await drawer.select({ id: 'b', description: 'B description' })
		expect(drawer.alt()).toBe('B description')
		expect(get).not.toHaveBeenCalled()
		drawer.save()
		expect(drawer.editor.getMarkdown()).toContain('![B description](/assets/b)')
	})

	it.each([undefined, null, '', '   ', 42])(
		'retries unusable description %s on the exact schedule and exhausts silently',
		async (description) => {
			const drawer = mount()
			await drawer.select({ id: 'a', description })
			expect(drawer.waiting()).toBe(true)
			expect(get).not.toHaveBeenCalled()
			for (const [index, delay] of [500, 1000, 2000, 4000, 8000].entries()) {
				await vi.advanceTimersByTimeAsync(delay - 1)
				expect(get).toHaveBeenCalledTimes(index)
				await vi.advanceTimersByTimeAsync(1)
				expect(get).toHaveBeenCalledTimes(index + 1)
			}
			expect(drawer.waiting()).toBe(false)
			await vi.advanceTimersByTimeAsync(30000)
			expect(get).toHaveBeenCalledTimes(5)
		},
	)

	it('stops after a matching description arrives', async () => {
		get.mockResolvedValue({ data: { data: { id: 'a', description: ' Generated ' } } })
		const drawer = mount()
		await drawer.select({ id: 'a' })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.alt()).toBe('Generated')
		expect(drawer.waiting()).toBe(false)
		expect(get).toHaveBeenCalledWith('/files/a?fields=id,description', {
			signal: expect.any(AbortSignal),
		})
		await vi.advanceTimersByTimeAsync(30000)
		expect(get).toHaveBeenCalledTimes(1)
	})

	it.each(['Author text', ''])(
		'protects manual input %s from pending results and replacement',
		async (value) => {
			let resolve: ((value: unknown) => void) | undefined
			get.mockImplementation(
				() =>
					new Promise<unknown>((done) => {
						resolve = done
					}),
			)
			const drawer = mount()
			await drawer.select({ id: 'a' })
			await vi.advanceTimersByTimeAsync(500)
			await drawer.type(value)
			resolve?.({ data: { data: { id: 'a', description: 'Late' } } })
			await vi.advanceTimersByTimeAsync(0)
			await drawer.select({ id: 'b', description: 'B' })
			expect(drawer.alt()).toBe(value)
			expect(drawer.waiting()).toBe(false)
		},
	)

	it.each(['replace', 'close', 'clear', 'unmount'])(
		'invalidates pending results on %s',
		async (action) => {
			let resolve: ((value: unknown) => void) | undefined
			get.mockImplementation(
				() =>
					new Promise<unknown>((done) => {
						resolve = done
					}),
			)
			const drawer = mount()
			await drawer.select({ id: 'a' })
			await vi.advanceTimersByTimeAsync(500)
			if (action === 'replace') await drawer.select({ id: 'b', description: 'B' })
			if (action === 'close') drawer.open.value = false
			if (action === 'clear')
				drawer.element
					.querySelector<HTMLButtonElement>('[aria-label="Deselect image"]')
					?.click()
			if (action === 'unmount') drawer.app.unmount()
			await nextTick()
			resolve?.({ data: { data: { id: 'a', description: 'Stale' } } })
			await vi.advanceTimersByTimeAsync(30000)
			expect(drawer.alt()).not.toBe('Stale')
			expect(drawer.waiting()).toBe(false)
			expect(get).toHaveBeenCalledTimes(1)
		},
	)

	it('preserves serialized alt during existing image editing without fetching defaults', async () => {
		const drawer = mount(true)
		expect(drawer.alt()).toBe('Stored alt')
		await drawer.select({ id: 'b', description: 'B' })
		expect(drawer.alt()).toBe('Stored alt')
		await vi.advanceTimersByTimeAsync(30000)
		expect(get).not.toHaveBeenCalled()
	})

	it('allows saving while polling and after a failed lookup', async () => {
		get.mockRejectedValue(new Error('Unavailable'))
		const drawer = mount()
		await drawer.select({ id: 'a' })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.waiting()).toBe(true)
		drawer.save()
		await nextTick()
		expect(drawer.editor.getMarkdown()).toContain('![](/assets/a)')
		expect(drawer.open.value).toBe(false)
		await vi.advanceTimersByTimeAsync(30000)
		expect(get).toHaveBeenCalledTimes(1)
	})
})
