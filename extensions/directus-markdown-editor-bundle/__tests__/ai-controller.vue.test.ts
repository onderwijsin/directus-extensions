// @vitest-environment happy-dom

import { computed, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	post: vi.fn(),
	notify: vi.fn(),
}))

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => ({ get: mocks.get, post: mocks.post }),
	useStores: () => ({ useNotificationsStore: () => ({ add: mocks.notify }) }),
}))

vi.mock('../src/markdown-editor-interface/components/preview/MarkdownPreview.vue', () => ({
	default: {
		props: ['content', 'label'],
		template: '<pre :aria-label="label">{{ content }}</pre>',
	},
}))

import AiController from '../src/markdown-editor-interface/components/ai/AiController.vue'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement; editor: Editor }[] = []

function registerPrimitives(app: ReturnType<typeof createApp>) {
	app.component(
		'VButton',
		defineComponent({
			inheritAttrs: false,
			template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
		}),
	)
	app.component(
		'VIcon',
		defineComponent({ props: ['name'], template: '<i :data-icon="name" />' }),
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
						localValue.value = !active.value
						emit('update:modelValue', localValue.value)
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
	for (const name of ['VDialog', 'VCard', 'VCardText', 'VCardActions']) {
		app.component(
			name,
			defineComponent({
				props: ['modelValue'],
				template: '<div v-if="modelValue === undefined || modelValue"><slot /></div>',
			}),
		)
	}
	app.component('VCardTitle', defineComponent({ template: '<h2><slot /></h2>' }))
	app.component(
		'VTextarea',
		defineComponent({
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template:
				'<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		}),
	)
}

function mountController() {
	const editor = new Editor({
		content: '# Original',
		contentType: 'markdown',
		extensions: createEditorExtensions(),
	})
	const applyDocument = vi.fn()
	const skillsChange = vi.fn()
	const root = defineComponent({
		setup: () => () =>
			h(AiController, {
				editor,
				collection: 'pages',
				field: 'body',
				value: '# Original',
				onApplyDocument: applyDocument,
				onSkillsChange: skillsChange,
			}),
	})
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(root)
	registerPrimitives(app)
	app.mount(element)
	mounted.push({ app, element, editor })
	return { element, editor, applyDocument, skillsChange }
}

beforeEach(() => {
	mocks.get.mockResolvedValue({
		data: {
			data: [
				{
					id: '019941df-2c10-7b6e-8c42-5d7f91a3e608',
					name: 'Improve clarity',
					description: null,
					icon: null,
					scopes: ['document'],
					archived: false,
					sort: 10,
				},
			],
		},
	})
	mocks.post.mockResolvedValue({ data: { content: '# Improved' } })
})

afterEach(() => {
	for (const entry of mounted.splice(0)) {
		entry.app.unmount()
		entry.editor.destroy()
		entry.element.remove()
	}
})

describe('AI controller', () => {
	it('loads visible skills and applies a reviewed document suggestion', async () => {
		const { element, applyDocument, skillsChange } = mountController()
		await vi.waitFor(() => expect(skillsChange).toHaveBeenCalledOnce())

		element.querySelector<HTMLButtonElement>('[aria-label="Edit with AI"]')?.click()
		await nextTick()
		const skill = [...element.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('Improve clarity'),
		)
		skill?.click()

		await vi.waitFor(() => expect(element.textContent).toContain('Review AI changes'))
		expect(element.querySelector('[aria-label="Suggested Markdown"]')?.textContent).toContain(
			'# Improved',
		)
		const apply = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Apply changes',
		)
		apply?.click()
		await nextTick()

		expect(mocks.post).toHaveBeenCalledWith(
			'/editor/ai',
			expect.objectContaining({
				scope: 'document',
				content: expect.stringContaining('# Original'),
				skillId: '019941df-2c10-7b6e-8c42-5d7f91a3e608',
				collection: 'pages',
				field: 'body',
			}),
		)
		expect(applyDocument).toHaveBeenCalledWith('# Improved')
	})

	it('reports skill loading and generation failures to Directus notifications', async () => {
		mocks.get.mockRejectedValueOnce(new Error('forbidden'))
		const { element } = mountController()
		await vi.waitFor(() =>
			expect(mocks.notify).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'error',
					title: expect.stringContaining('permission'),
				}),
			),
		)

		mocks.post.mockRejectedValueOnce(new Error('Provider unavailable'))
		element.querySelector<HTMLButtonElement>('[aria-label="Edit with AI"]')?.click()
		await nextTick()
		const ask = [...element.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('Ask AI'),
		)
		ask?.click()
		await nextTick()
		const textarea = element.querySelector<HTMLTextAreaElement>('textarea')
		if (!textarea) throw new Error('Expected prompt input')
		textarea.value = 'Improve this'
		textarea.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		const generate = [...element.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('Generate'),
		)
		generate?.click()

		await vi.waitFor(() =>
			expect(mocks.notify).toHaveBeenCalledWith({
				title: 'Provider unavailable',
				type: 'error',
			}),
		)
	})
})
