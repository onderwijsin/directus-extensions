// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}

import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MediaDrawer from '../src/markdown-editor-interface/components/drawers/MediaDrawer.vue'
import { useImageAltText } from '../src/markdown-editor-interface/composables/useImageAltText'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'

const get = vi.hoisted(() => vi.fn())
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get }) }))
const cleanup: (() => void)[] = []

function mount(existing = false, initialType: 'image' | 'video' = 'image') {
	const updates: string[] = []
	const editor = new Editor({
		extensions: createEditorExtensions(),
		onUpdate: ({ editor: instance }) => updates.push(instance.getMarkdown()),
	})
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
	const visible = shallowRef(true)
	let selection: unknown = { id: 'a' }
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(
		defineComponent({
			setup: () => {
				const imageAltText = useImageAltText(
					() => editor,
					() => false,
				)
				return () =>
					visible.value
						? h(MediaDrawer, {
								editor,
								imageAltText,
								initialType,
								modelValue: open.value,
								'onUpdate:modelValue': (value: boolean) => {
									open.value = value
								},
							})
						: null
			},
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
	app.component('VProgressCircular', defineComponent({ template: '<span class="spinner" />' }))
	app.component(
		'VSelect',
		defineComponent({
			props: ['modelValue', 'items'],
			emits: ['update:modelValue'],
			template:
				'<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.text }}</option></select>',
		}),
	)
	app.component(
		'VCheckbox',
		defineComponent({
			props: ['modelValue', 'label'],
			emits: ['update:modelValue'],
			template:
				'<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
		}),
	)
	app.component(
		'VInput',
		defineComponent({
			props: { modelValue: [String, Number], nullable: { type: Boolean, default: true } },
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value === \'\' && nullable ? null : $event.target.value)"/>',
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
		updates,
		visible,
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
				.find((button) => ['Save Image', 'Save Media'].includes(button.textContent ?? ''))
				?.click(),
		location: async (value: string) => {
			const input = element.querySelector('select')
			if (!input) throw new Error('Missing media location select')
			input.value = value
			input.dispatchEvent(new Event('change', { bubbles: true }))
			await nextTick()
		},
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

describe('provider video drawer', () => {
	it('keeps the drawer usable when undo clears the video URL', async () => {
		const drawer = mount(false, 'video')
		await drawer.location('Embed')
		await drawer.type('https://youtu.be/M7lc1UVf-VE')
		const input = drawer.element.querySelector('input')
		if (!input) throw new Error('Missing video URL input')
		input.value = ''
		input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'historyUndo' }))
		await nextTick()

		expect(drawer.open.value).toBe(true)
		expect(drawer.element.querySelector('aside')).not.toBeNull()
		expect(drawer.element.querySelector('[role="alert"]')).toBeNull()
		expect(drawer.element.querySelector('iframe')).toBeNull()
		const save = [...drawer.element.querySelectorAll('button')].find(
			(button) => button.textContent === 'Save Media',
		)
		expect(save?.disabled).toBe(true)
		await drawer.type('https://vimeo.com/76979871')
		drawer.save()
		expect(drawer.editor.getMarkdown()).toContain('https://player.vimeo.com/video/76979871')
	})

	it('validates an embed independently of the selected file and edits its privacy mode', async () => {
		const drawer = mount(false, 'video')
		expect(drawer.element.querySelector('select')?.value).toBe('File library')
		await drawer.select({ id: 'local-video' })
		await drawer.location('Embed')
		await drawer.type('https://example.com/video')
		expect(drawer.element.querySelector('[role="alert"]')?.textContent).toContain(
			'Paste a YouTube or Vimeo link to a specific video.',
		)
		const save = [...drawer.element.querySelectorAll('button')].find(
			(button) => button.textContent === 'Save Media',
		)
		expect(save?.disabled).toBe(true)
		await drawer.type('https://youtu.be/M7lc1UVf-VE?si=tracking')
		expect(drawer.element.querySelector<HTMLInputElement>('[type="checkbox"]')?.checked).toBe(
			true,
		)
		expect(drawer.element.querySelector('iframe')).toBeTruthy()
		drawer.save()
		await nextTick()
		expect(drawer.editor.getMarkdown()).toContain(
			'<iframe src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE" allow="fullscreen; encrypted-media" allowfullscreen></iframe>',
		)

		drawer.editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'video') drawer.editor.commands.setNodeSelection(position)
		})
		drawer.open.value = true
		await nextTick()
		expect(drawer.element.querySelector('select')?.value).toBe('Embed')
		drawer.element.querySelector<HTMLInputElement>('[type="checkbox"]')?.click()
		await nextTick()
		drawer.save()
		await nextTick()
		expect(drawer.editor.getMarkdown()).toContain(
			'<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE" allow="fullscreen; encrypted-media" allowfullscreen></iframe>',
		)
		expect(
			drawer.editor.getJSON().content?.filter((node) => node.type === 'video'),
		).toHaveLength(1)

		drawer.open.value = true
		await nextTick()
		expect(drawer.element.querySelector<HTMLInputElement>('[type="checkbox"]')?.checked).toBe(
			false,
		)
		await drawer.location('File library')
		await drawer.select({ id: 'replacement-video' })
		drawer.save()
		expect(drawer.editor.getMarkdown()).toContain(
			'<video src="/assets/replacement-video" controls></video>',
		)
		expect(drawer.editor.getMarkdown()).not.toContain('<iframe')
	})

	it('saves an unlisted Vimeo video with privacy mode and preserves it on reopening', async () => {
		const drawer = mount(false, 'video')
		await drawer.location('Embed')
		await drawer.type('https://vimeo.com/76979871/8272103f6e')
		drawer.save()
		await nextTick()
		expect(drawer.editor.getMarkdown()).toContain(
			'<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e&amp;dnt=1" allow="fullscreen; encrypted-media" allowfullscreen></iframe>',
		)
		drawer.editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'video') drawer.editor.commands.setNodeSelection(position)
		})
		drawer.open.value = true
		await nextTick()
		expect(drawer.element.querySelector<HTMLInputElement>('[type="checkbox"]')?.checked).toBe(
			true,
		)
		expect(drawer.alt()).toBe('https://player.vimeo.com/video/76979871?h=8272103f6e&dnt=1')
		drawer.element.querySelector<HTMLInputElement>('[type="checkbox"]')?.click()
		await nextTick()
		drawer.save()
		expect(drawer.editor.getMarkdown()).toContain(
			'<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e" allow="fullscreen; encrypted-media" allowfullscreen></iframe>',
		)
	})

	it.each([
		{
			url: 'https://youtu.be/M7lc1UVf-VE',
			query: 'fs=0&controls=0&loop=1&playlist=M7lc1UVf-VE&autoplay=1&mute=1',
		},
		{
			url: 'https://vimeo.com/76979871',
			query: 'dnt=1&fullscreen=0&controls=0&loop=1&autoplay=1&muted=1',
		},
	])('saves and restores all controls for $url', async ({ url, query }) => {
		const drawer = mount(false, 'video')
		await drawer.location('Embed')
		await drawer.type(url)
		const checkbox = (label: string) =>
			[...drawer.element.querySelectorAll('label')]
				.find((element) => element.textContent?.trim() === label)
				?.querySelector<HTMLInputElement>('input[type="checkbox"]')
		for (const label of [
			'Allow fullscreen',
			'Show player controls',
			'Loop',
			'Autoplay',
			'Start muted',
		]) {
			const input = checkbox(label)
			expect(input).toBeTruthy()
			input?.click()
			await nextTick()
		}
		expect(drawer.element.textContent).not.toContain('Start at')
		expect(drawer.element.textContent).not.toContain('Allow picture-in-picture')
		expect(drawer.element.textContent).not.toContain('Show captions by default')
		expect(drawer.element.querySelector('iframe')).toBeTruthy()
		drawer.save()
		await nextTick()
		const markdown = drawer.editor.getMarkdown()
		expect(markdown).toContain(query.replaceAll('&', '&amp;'))
		expect(markdown).toContain('allow="autoplay; fullscreen \'none\'; encrypted-media"')
		expect(markdown).not.toContain('allowfullscreen')
		drawer.editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'video') drawer.editor.commands.setNodeSelection(position)
		})
		drawer.open.value = true
		await nextTick()
		for (const label of ['Allow fullscreen', 'Show player controls'])
			expect(checkbox(label)?.checked).toBe(false)
		for (const label of ['Loop', 'Autoplay', 'Start muted'])
			expect(checkbox(label)?.checked).toBe(true)
	})
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
		expect(get).toHaveBeenCalledTimes(5)
	})

	it('shows a spinner and explains background continuation while waiting', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		expect(drawer.element.querySelector('[role="status"] .spinner')).toBeTruthy()
		expect(drawer.element.querySelector('[role="status"]')?.textContent).toContain(
			"Waiting for image metadata… Save the image to continue in the background. Don't navigate away from this page.",
		)
	})

	it('fills the saved Markdown after the drawer closes and emits the updated value', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		drawer.save()
		await nextTick()
		expect(drawer.editor.getMarkdown()).toContain('![](/assets/a)')
		get.mockResolvedValue({ data: { data: { id: 'a', description: 'Background alt' } } })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.editor.getMarkdown()).toContain('![Background alt](/assets/a)')
		expect(drawer.updates.at(-1)).toContain('![Background alt](/assets/a)')
	})

	it('continues after drawer unmount and follows document position changes', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		drawer.save()
		drawer.visible.value = false
		await nextTick()
		drawer.editor.commands.insertContentAt(0, {
			type: 'paragraph',
			content: [{ type: 'text', text: 'Prefix' }],
		})
		get.mockResolvedValue({ data: { data: { id: 'a', description: 'Moved image' } } })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.editor.getMarkdown()).toContain('![Moved image](/assets/a)')
		expect(drawer.editor.getMarkdown()).toContain('Prefix')
	})

	it('fills the reopened field for a pending saved image without starting another request', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		drawer.save()
		await nextTick()
		drawer.editor.state.doc.descendants((node, position) => {
			if (node.type.name === 'image') drawer.editor.commands.setNodeSelection(position)
		})
		drawer.open.value = true
		await nextTick()
		expect(drawer.waiting()).toBe(true)
		get.mockResolvedValue({ data: { data: { id: 'a', description: 'Reopened alt' } } })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.alt()).toBe('Reopened alt')
		expect(drawer.editor.getMarkdown()).toContain('![Reopened alt](/assets/a)')
		expect(get).toHaveBeenCalledTimes(1)
	})

	it.each(['manual', 'delete', 'undo', 'replace', 'destroy'])(
		'invalidates saved image metadata on %s',
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
			drawer.save()
			await nextTick()
			await vi.advanceTimersByTimeAsync(500)
			drawer.editor.state.doc.descendants((node, position) => {
				if (node.type.name === 'image') drawer.editor.commands.setNodeSelection(position)
			})
			if (action === 'manual')
				drawer.editor.commands.updateAttributes('image', { alt: 'Author' })
			if (action === 'delete') drawer.editor.commands.deleteSelection()
			if (action === 'undo') drawer.editor.commands.undo()
			if (action === 'replace')
				drawer.editor.commands.setContent('![](/assets/a)', { contentType: 'markdown' })
			if (action === 'destroy') drawer.editor.destroy()
			resolve?.({ data: { data: { id: 'a', description: 'Stale' } } })
			await vi.advanceTimersByTimeAsync(30000)
			if (!drawer.editor.isDestroyed)
				expect(drawer.editor.getMarkdown()).not.toContain('Stale')
			expect(get).toHaveBeenCalledTimes(1)
		},
	)
	it('updates only the newly inserted occurrence when the same file is already in Markdown', async () => {
		const drawer = mount()
		drawer.open.value = false
		await nextTick()
		drawer.editor.commands.insertContent({
			type: 'image',
			attrs: { src: '/assets/a', alt: 'Existing' },
		})
		drawer.editor.commands.setTextSelection(drawer.editor.state.doc.content.size - 1)
		drawer.open.value = true
		await nextTick()
		await drawer.select({ id: 'a' })
		drawer.save()
		await nextTick()
		get.mockResolvedValue({ data: { data: { id: 'a', description: 'New occurrence' } } })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.editor.getMarkdown()).toContain('![Existing](/assets/a)')
		expect(drawer.editor.getMarkdown()).toContain('![New occurrence](/assets/a)')
	})

	it('keeps an earlier saved lookup independent of a later insertion draft', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		drawer.save()
		await nextTick()
		drawer.editor.commands.setTextSelection(drawer.editor.state.doc.content.size - 1)
		drawer.open.value = true
		await nextTick()
		await drawer.select({ id: 'b' })
		get.mockImplementation((url: string) =>
			Promise.resolve({
				data: {
					data: {
						id: url.includes('/a?') ? 'a' : 'b',
						description: url.includes('/a?') ? 'Earlier' : null,
					},
				},
			}),
		)
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.editor.getMarkdown()).toContain('![Earlier](/assets/a)')
		expect(drawer.alt()).toBe('')
		expect(drawer.waiting()).toBe(true)
	})
	it('tracks saved images through transactions appended by editor plugins', async () => {
		const drawer = mount()
		await drawer.select({ id: 'a' })
		drawer.save()
		await nextTick()
		drawer.editor.registerPlugin(
			new Plugin({
				appendTransaction: (transactions, _oldState, state) => {
					if (!transactions.some((transaction) => transaction.getMeta('append-prefix')))
						return null
					const paragraph = state.schema.nodes.paragraph
					if (!paragraph) return null
					return state.tr.insert(
						0,
						paragraph.create(null, state.schema.text('Plugin prefix')),
					)
				},
			}),
		)
		drawer.editor.view.dispatch(drawer.editor.state.tr.setMeta('append-prefix', true))
		get.mockResolvedValue({ data: { data: { id: 'a', description: 'Plugin mapped' } } })
		await vi.advanceTimersByTimeAsync(500)
		expect(drawer.editor.getMarkdown()).toContain('![Plugin mapped](/assets/a)')
	})
})
