// @vitest-environment happy-dom

import { computed, createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownEditorOptions } from '../src/markdown-editor-interface'
import ComponentPropsDrawer from '../src/markdown-editor-interface/components/drawers/ComponentPropsDrawer.vue'
import MediaDrawer from '../src/markdown-editor-interface/components/drawers/MediaDrawer.vue'
import Field from '../src/markdown-editor-interface/components/fields/Field.vue'
import ImageUploadField from '../src/markdown-editor-interface/components/fields/ImageUploadField.vue'
import NumberInput from '../src/markdown-editor-interface/components/fields/NumberInput.vue'
import ObjectArrayInput from '../src/markdown-editor-interface/components/fields/ObjectArrayInput.vue'
import StringInput from '../src/markdown-editor-interface/components/fields/StringInput.vue'
import TagsInput from '../src/markdown-editor-interface/components/fields/TagsInput.vue'
import VideoUploadField from '../src/markdown-editor-interface/components/fields/VideoUploadField.vue'
import EditorTableMenu from '../src/markdown-editor-interface/components/toolbar/EditorTableMenu.vue'
import EditorToolbar from '../src/markdown-editor-interface/components/toolbar/EditorToolbar.vue'
import { createEditorCommands } from '../src/markdown-editor-interface/editor/commands'
import { createEditorExtensions } from '../src/markdown-editor-interface/editor/extensions'
import MarkdownEditor from '../src/markdown-editor-interface/MarkdownEditor.vue'

const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

vi.mock('vuedraggable', () => ({
	default: defineComponent({
		props: ['modelValue', 'disabled'],
		emits: ['update:modelValue'],
		setup(props, { emit, slots }) {
			return () => {
				const values: unknown[] = Array.isArray(props.modelValue) ? props.modelValue : []
				return h('div', { class: 'sortable-test' }, [
					...values.map((element, index) => slots.item?.({ element, index })),
					h('button', {
						'aria-label': 'Simulate drag reorder',
						disabled: props.disabled,
						onClick: () => emit('update:modelValue', [...values].reverse()),
					}),
				])
			}
		},
	}),
}))

describe('object array input', () => {
	it('adds, reorders, and confirms removal of rows', async () => {
		const rows = shallowRef<unknown[]>([{ label: 'First' }, { label: 'Second' }])
		const element = document.createElement('div')
		const app = createApp(
			defineComponent({
				components: { ObjectArrayInput },
				setup: () => ({
					rows,
					definition: {
						type: 'object',
						properties: { label: { type: 'string', required: true } },
					},
				}),
				template:
					'<ObjectArrayInput v-model="rows" :definition="definition" path="actions" :errors="{}" asset-storage-mode="path" />',
			}),
		)
		registerDirectusPrimitives(app)
		app.mount(element)
		mounted.push({ app, element })

		element.querySelector<HTMLButtonElement>('[aria-label="Move item 2 up"]')?.click()
		await nextTick()
		expect(rows.value).toEqual([{ label: 'Second' }, { label: 'First' }])

		element.querySelector<HTMLButtonElement>('[aria-label="Remove item 1"]')?.click()
		await nextTick()
		expect(
			element.querySelector('[aria-label="Remove item 1"] i[data-icon="close"]'),
		).toBeTruthy()
		expect(rows.value).toHaveLength(2)
		expect(element.textContent).toContain('Remove item?')
		element.querySelector<HTMLButtonElement>('[role="alertdialog"] button')?.click()
		await nextTick()
		expect(rows.value).toHaveLength(2)

		element.querySelector<HTMLButtonElement>('[aria-label="Remove item 1"]')?.click()
		await nextTick()
		const confirm = [
			...element.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'),
		].find((button) => button.textContent?.includes('Remove'))
		confirm?.click()
		await nextTick()
		expect(rows.value).toEqual([{ label: 'First' }])

		const add = [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
			button.textContent?.includes('Add item'),
		)
		add?.click()
		await nextTick()
		expect(rows.value).toEqual([{ label: 'First' }, { label: '' }])

		element.querySelector<HTMLButtonElement>('[aria-label="Simulate drag reorder"]')?.click()
		await nextTick()
		expect(rows.value).toEqual([{ label: '' }, { label: 'First' }])
	})
})

describe('tags input', () => {
	it('persists chip drag order', async () => {
		const tags = shallowRef(['first', 'second'])
		const element = document.createElement('div')
		const app = createApp(
			defineComponent({
				components: { TagsInput },
				setup: () => ({ tags }),
				template: '<TagsInput v-model="tags" />',
			}),
		)
		registerDirectusPrimitives(app)
		app.mount(element)
		mounted.push({ app, element })
		element.querySelector<HTMLButtonElement>('[aria-label="Simulate drag reorder"]')?.click()
		await nextTick()
		expect(tags.value).toEqual(['second', 'first'])
		expect(
			element.querySelector('[aria-label="Remove second"] i[data-icon="close"]'),
		).toBeTruthy()
		element.querySelector<HTMLButtonElement>('[aria-label="Remove second"]')?.click()
		await nextTick()
		expect(tags.value).toEqual(['first'])
	})
})

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
			emits: ['update:modelValue'],
			template:
				'<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
		}),
	)
	app.component(
		'VUpload',
		defineComponent({
			props: ['accept', 'filter'],
			template:
				'<div class="v-upload-stub" :data-accept="accept" :data-filter="JSON.stringify(filter)" />',
		}),
	)
	app.component('VNotice', defineComponent({ template: '<div><slot /></div>' }))
	app.component('VProgressCircular', defineComponent({ template: '<div />' }))
	app.component('VChip', defineComponent({ template: '<span><slot /></span>' }))
}

function mountEditor(
	initialValue = '# Hello',
	disabled = false,
	tools?: string[],
	metadataOptions?: {
		useStaticComponentMeta?: boolean
		staticComponentMeta?: unknown
		useReferences?: boolean
		referenceCollections?: unknown
		comparisonMode?: boolean
		options?: {
			useStaticComponentMeta?: boolean
			staticComponentMeta?: unknown
		}
	},
) {
	const value = shallowRef<string | null>(initialValue)
	const disabledValue = shallowRef(disabled)
	const input = vi.fn()
	const root = defineComponent({
		setup: () => () =>
			h(MarkdownEditor, {
				value: value.value,
				disabled: disabledValue.value,
				tools,
				...metadataOptions,
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
	it('persists image alt text when inserting and editing through the media drawer', async () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		const open = shallowRef(true)
		const element = document.createElement('div')
		const app = createApp(
			defineComponent({
				setup: () => () =>
					h(MediaDrawer, {
						editor,
						modelValue: open.value,
						'onUpdate:modelValue': (value: boolean) => (open.value = value),
						initialType: 'image',
					}),
			}),
		)
		registerDirectusPrimitives(app)
		app.component(
			'VUpload',
			defineComponent({
				emits: ['input'],
				template:
					'<button class="select-image" @click="$emit(\'input\', { id: \'image-1\' })">Select image</button>',
			}),
		)
		app.component(
			'VInput',
			defineComponent({
				props: ['modelValue'],
				emits: ['update:modelValue'],
				template:
					'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			}),
		)
		app.mount(element)
		mounted.push({ app, element })
		await nextTick()
		const initialAltInput = element.querySelector<HTMLInputElement>('input')
		if (!initialAltInput) throw new Error('Alt text input was not rendered')
		element.querySelector<HTMLButtonElement>('.select-image')?.click()
		initialAltInput.value = 'A blue bird'
		initialAltInput.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		;[...element.querySelectorAll('button')]
			.find((button) => button.textContent?.includes('Save Image'))
			?.click()
		expect(editor.getMarkdown()).toContain('![A blue bird](/assets/image-1)')

		editor.commands.setNodeSelection(1)
		open.value = true
		await nextTick()
		const altInput = element.querySelector<HTMLInputElement>('input')
		expect(altInput?.value).toBe('A blue bird')
		if (!altInput) throw new Error('Alt text input was not rendered')
		altInput.value = 'A red bird'
		altInput.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		;[...element.querySelectorAll('button')]
			.find((button) => button.textContent?.includes('Save Image'))
			?.click()
		expect(editor.getMarkdown()).toContain('![A red bird](/assets/image-1)')
		editor.destroy()
	})

	it('associates field labels, descriptions, and errors with the input', () => {
		const root = defineComponent({
			components: { Field, StringInput },
			template:
				'<Field label="Title" description="Shown above the body" error="Title is required" required><template #default="field"><StringInput v-bind="field" model-value="" /></template></Field>',
		})
		const element = document.createElement('div')
		document.body.appendChild(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.mount(element)
		mounted.push({ app, element })
		const input = element.querySelector('input')
		const label = element.querySelector('label')
		expect(label?.htmlFor).toBe(input?.id)
		expect(input?.getAttribute('aria-describedby')).toBe(
			`${input?.id}-description ${input?.id}-error`,
		)
		expect(input?.getAttribute('aria-invalid')).toBe('true')
		expect(input?.getAttribute('aria-required')).toBe('true')
		expect(element.querySelector('[role="alert"]')?.textContent).toBe('Title is required')
	})

	it('keeps empty numeric inputs empty and emits only finite numbers', async () => {
		const update = vi.fn()
		const root = defineComponent({
			setup: () => () => h(NumberInput, { modelValue: '', 'onUpdate:modelValue': update }),
		})
		const element = document.createElement('div')
		document.body.appendChild(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.component(
			'VInput',
			defineComponent({
				props: ['modelValue'],
				emits: ['update:modelValue'],
				template:
					'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
			}),
		)
		app.mount(element)
		mounted.push({ app, element })
		const input = element.querySelector('input')
		if (!input) throw new Error('Number input was not rendered')
		for (const value of ['42', '', 'not-a-number']) {
			input.value = value
			input.dispatchEvent(new Event('input', { bubbles: true }))
		}
		await nextTick()
		expect(update).toHaveBeenCalledTimes(2)
		expect(update).toHaveBeenNthCalledWith(1, 42)
		expect(update).toHaveBeenNthCalledWith(2, '')
	})

	it('renders the selected image preview and forwards image selections', async () => {
		const selected = vi.fn()
		const cleared = vi.fn()
		const root = defineComponent({
			setup: () => () =>
				h(ImageUploadField, {
					previewSource: '/assets/current-image',
					onSelect: selected,
					onClear: cleared,
				}),
		})
		const element = document.createElement('div')
		document.body.appendChild(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.component(
			'VUpload',
			defineComponent({
				props: ['filter'],
				emits: ['input'],
				template:
					'<button class="upload-image" :data-filter="JSON.stringify(filter)" @click="$emit(\'input\', { id: \'next-image\' })">Upload</button>',
			}),
		)
		app.mount(element)
		mounted.push({ app, element })

		expect(element.querySelector('img')?.getAttribute('src')).toBe('/assets/current-image')
		expect(element.querySelector('.upload-image')?.getAttribute('data-filter')).toBe(
			'{"type":{"_contains":"image"}}',
		)
		element.querySelector<HTMLButtonElement>('.upload-image')?.click()
		await nextTick()
		expect(selected).toHaveBeenCalledWith({ id: 'next-image' })
		element.querySelector<HTMLButtonElement>('[aria-label="Deselect image"]')?.click()
		await nextTick()
		expect(cleared).toHaveBeenCalledOnce()
	})

	it('renders a playable selected video preview and supports replacement or deselection', async () => {
		const selected = vi.fn()
		const cleared = vi.fn()
		const root = defineComponent({
			setup: () => () =>
				h(VideoUploadField, {
					previewSource: '/assets/current-video',
					onSelect: selected,
					onClear: cleared,
				}),
		})
		const element = document.createElement('div')
		document.body.append(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.component(
			'VUpload',
			defineComponent({
				props: ['filter'],
				emits: ['input'],
				template:
					'<button class="upload-video" :data-filter="JSON.stringify(filter)" @click="$emit(\'input\', { id: \'next-video\' })">Upload</button>',
			}),
		)
		app.mount(element)
		mounted.push({ app, element })

		const preview = element.querySelector('video')
		expect(preview?.getAttribute('src')).toBe('/assets/current-video')
		expect(preview?.hasAttribute('controls')).toBe(true)
		expect(preview?.getAttribute('preload')).toBe('metadata')
		expect(element.querySelector('.upload-video')?.getAttribute('data-filter')).toBe(
			'{"type":{"_contains":"video"}}',
		)
		element.querySelector<HTMLButtonElement>('.upload-video')?.click()
		await nextTick()
		expect(selected).toHaveBeenCalledWith({ id: 'next-video' })
		element.querySelector<HTMLButtonElement>('[aria-label="Deselect video"]')?.click()
		await nextTick()
		expect(cleared).toHaveBeenCalledOnce()
	})

	it('keeps toolbar command buttons mounted across editor transactions', async () => {
		const editor = new Editor({
			extensions: createEditorExtensions(),
			content: '<p>Format me</p>',
		})
		editor.commands.selectAll()
		const root = defineComponent({
			setup: () => () =>
				h(EditorToolbar, {
					editor,
					commands: createEditorCommands(),
				}),
		})
		const element = document.createElement('div')
		document.body.appendChild(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.mount(element)
		mounted.push({ app, element })
		const bold = element.querySelector<HTMLButtonElement>('[aria-label="Bold"]')
		expect(bold).not.toBeNull()

		editor.commands.setMeta('dismissSlashMenu', true)
		await nextTick()
		expect(bold?.isConnected).toBe(true)
		bold?.click()
		await nextTick()

		expect(editor.getHTML()).toContain('<strong>Format me</strong>')
		editor.destroy()
	})

	it('filters the video library by MIME type', async () => {
		const { element } = mountEditor()
		await nextTick()
		element.querySelector<HTMLButtonElement>('[aria-label="Insert video"]')?.click()
		await nextTick()

		const upload = element.querySelector('.v-upload-stub')
		expect(upload?.getAttribute('data-accept')).toBe('video/*')
		expect(upload?.getAttribute('data-filter')).toBe('{"type":{"_contains":"video"}}')
	})

	it('persists the selected image asset path for tagged string properties', async () => {
		const editor = new Editor({ extensions: createEditorExtensions() })
		const root = defineComponent({
			setup: () => () =>
				h(ComponentPropsDrawer, {
					editor,
					open: true,
					component: {
						name: 'Hero',
						label: 'Hero',
						nodeType: 'block',
						props: {
							image: {
								type: 'string',
								tags: [{ name: 'specialInputType', text: 'image' }],
							},
						},
						slots: [],
					},
				}),
		})
		const element = document.createElement('div')
		document.body.appendChild(element)
		const app = createApp(root)
		registerDirectusPrimitives(app)
		app.component(
			'VUpload',
			defineComponent({
				emits: ['input'],
				template:
					'<button class="select-image" @click="$emit(\'input\', { id: \'asset-id\' })">Select image</button>',
			}),
		)
		app.mount(element)
		mounted.push({ app, element })

		element.querySelector<HTMLButtonElement>('.select-image')?.click()
		await nextTick()
		Array.from(element.querySelectorAll('button'))
			.find((button) => button.textContent?.includes('Insert'))
			?.click()
		await nextTick()

		expect(editor.getJSON().content).toContainEqual({
			type: 'mdcBlock',
			attrs: {
				name: 'Hero',
				props: { image: '/assets/asset-id' },
				depth: 2,
				propsFormat: 'inline',
			},
		})
		editor.destroy()
	})

	it('keeps AI explicitly disabled by default', () => {
		expect(createMarkdownEditorOptions().find((option) => option.field === 'ai')).toMatchObject(
			{
				type: 'boolean',
				schema: { default_value: false },
			},
		)
	})
	it('configures path storage by default and shows base URL for absolute URL storage', () => {
		const options = createMarkdownEditorOptions()
		expect(options.find((option) => option.field === 'assetStorageMode')).toMatchObject({
			type: 'string',
			schema: { default_value: 'path' },
		})
		expect(options.find((option) => option.field === 'assetBaseUrl')).toMatchObject({
			type: 'string',
			meta: { conditions: [{ rule: { assetStorageMode: { _neq: 'url' } }, hidden: true }] },
		})
	})
	it('exposes a Directus multiselect for all configurable tools', () => {
		const options = createMarkdownEditorOptions()
		const tools = options.find((option) => option.field === 'tools')

		expect(tools).toMatchObject({
			type: 'json',
			meta: {
				interface: 'select-multiple-dropdown',
				options: { allowNone: true, showDeselect: true },
			},
			schema: { default_value: [] },
		})
		expect(tools?.meta?.options?.choices).toEqual(
			expect.arrayContaining([
				{ text: 'Heading 1', value: 'heading-1' },
				{ text: 'Edit source', value: 'source' },
				{ text: 'Full screen', value: 'fullscreen' },
			]),
		)
		expect(tools?.meta?.options?.choices).not.toContainEqual({
			text: 'Component insert',
			value: 'component',
		})
		expect(tools?.meta?.options?.choices).not.toContainEqual({
			text: 'All tools',
			value: 'all',
		})
	})

	it('configures static and URL component metadata as mutually exclusive sources', () => {
		const options = createMarkdownEditorOptions()
		const useStatic = options.find((option) => option.field === 'useStaticComponentMeta')
		const metadataUrl = options.find((option) => option.field === 'metadataUrl')
		const staticMetadata = options.find((option) => option.field === 'staticComponentMeta')

		expect(useStatic).toMatchObject({
			type: 'boolean',
			meta: { interface: 'checkbox' },
			schema: { default_value: false },
		})
		expect(metadataUrl?.meta.conditions).toEqual([
			{
				rule: { useStaticComponentMeta: { _eq: true } },
				hidden: true,
			},
		])
		expect(staticMetadata).toMatchObject({
			type: 'json',
			required: true,
			meta: {
				interface: 'input-code',
				options: { language: 'json' },
				conditions: [
					{
						rule: { useStaticComponentMeta: { _eq: false } },
						hidden: true,
					},
				],
			},
		})
	})

	it('configures opt-in references with conditional collections and detect mode by default', () => {
		const options = createMarkdownEditorOptions()
		expect(options.find((option) => option.field === 'useReferences')).toMatchObject({
			name: 'Use item references',
			type: 'boolean',
			schema: { default_value: false },
		})
		expect(options.find((option) => option.field === 'referenceCollections')).toMatchObject({
			type: 'json',
			required: true,
			meta: { conditions: [{ rule: { useReferences: { _eq: false } }, hidden: true }] },
		})
		expect(options.find((option) => option.field === 'referenceSnapshotMode')).toMatchObject({
			schema: { default_value: 'detect' },
		})
		expect(options.find((option) => option.field === 'enableReferenceIcon')).toMatchObject({
			meta: { conditions: [{ rule: { useReferences: { _eq: false } }, hidden: true }] },
			schema: { default_value: false },
		})
		expect(options.find((option) => option.field === 'iconifyCollections')).toMatchObject({
			meta: {
				interface: 'select-multiple-dropdown',
				options: {
					choices: expect.arrayContaining([{ text: 'lucide', value: 'lucide' }]),
				},
			},
		})
		expect(options.find((option) => option.field === 'useIconifyProxy')).toMatchObject({
			schema: { default_value: false },
		})
		expect(
			options.find((option) => option.field === 'tools')?.meta.options?.choices,
		).not.toContainEqual({ text: 'Reference', value: 'reference' })
	})

	it('does not mount Reference integrity reporting in a Directus comparison view', async () => {
		const { element } = mountEditor('# Comparison', true, undefined, {
			useReferences: true,
			referenceCollections: [],
			comparisonMode: true,
		})
		await nextTick()
		await nextTick()

		expect(element.querySelector('.reference-configuration-error')).toBeNull()
		expect(element.querySelector('[aria-label="Reference report"]')).toBeNull()
	})

	it('renders Markdown and the complete Directus-native toolbar', async () => {
		const { element } = mountEditor()
		await nextTick()
		await nextTick()
		await new Promise((resolve) => window.setTimeout(resolve))

		expect(element.querySelector('[role="textbox"]')?.textContent).toBe('Hello')
		expect(element.querySelector('[role="toolbar"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Block type"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Bold"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Insert component"]')).toBeNull()
		expect(element.querySelector('.markdown-editor__metadata-error')).toBeNull()
		expect(element.querySelector('[aria-label="Edit Markdown source"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Full screen"]')).not.toBeNull()
		expect(
			element.querySelector('[aria-label="More editor actions"]')?.hasAttribute('disabled'),
		).toBe(false)
		expect(element.querySelector('.editor-toolbar__action-group')).not.toBeNull()
		expect(element.querySelector('.editor-toolbar__special-group')).not.toBeNull()
		const dragHandleLayer = element.querySelector('.editor-block-controls')?.parentElement
		expect(dragHandleLayer instanceof HTMLElement && dragHandleLayer.style.zIndex).toBe('1')
	})

	it('keeps table actions mounted while a bubble-menu button receives focus', async () => {
		const editorHost = document.createElement('div')
		const menuHost = document.createElement('div')
		document.body.append(editorHost, menuHost)
		const editor = new Editor({ element: editorHost, extensions: createEditorExtensions() })
		const app = createApp(
			defineComponent({
				setup: () => () =>
					h(EditorTableMenu, {
						editor,
						commands: createEditorCommands(),
					}),
			}),
		)
		registerDirectusPrimitives(app)

		try {
			expect(editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true })).toBe(
				true,
			)
			editor.view.focus()
			app.mount(menuHost)
			await nextTick()

			const addRowButton = document.querySelector('[aria-label="Add row below"]')
			expect(addRowButton).toBeInstanceOf(HTMLButtonElement)
			if (!(addRowButton instanceof HTMLButtonElement)) return
			addRowButton.focus()
			await nextTick()

			expect(addRowButton.isConnected).toBe(true)
			addRowButton.click()
			expect(editor.getJSON().content?.[0]?.content).toHaveLength(3)
		} finally {
			app.unmount()
			editor.destroy()
			editorHost.remove()
			menuHost.remove()
		}
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
		expect(element.querySelector('[aria-label="Block type"]')).toBeNull()
	})

	it('shows Reference insertion with restricted tools only when references are enabled', async () => {
		const enabled = mountEditor('References', false, ['paragraph'], {
			useReferences: true,
			referenceCollections: [],
		})
		const disabled = mountEditor('References', false, ['paragraph', 'reference'], {
			useReferences: false,
		})
		await nextTick()
		await nextTick()

		expect(enabled.element.querySelector('[aria-label="Insert reference"]')).not.toBeNull()
		expect(disabled.element.querySelector('[aria-label="Insert reference"]')).toBeNull()
	})

	it('treats an empty tool selection as all tools', async () => {
		const { element } = mountEditor('All tools', false, [])
		await nextTick()
		await nextTick()

		expect(element.querySelector('[aria-label="Bold"]')).not.toBeNull()
		expect(element.querySelector('[aria-label="Block type"]')).not.toBeNull()
	})

	it('keeps component insertion and settings available with a restricted tool selection', async () => {
		const { element } = mountEditor(
			'::Callout{tone="warning"}\n#default\nContent\n::',
			false,
			['paragraph'],
			{
				useStaticComponentMeta: true,
				staticComponentMeta: [
					{ name: 'Callout', nodeType: 'block', props: { tone: {} }, slots: ['default'] },
				],
			},
		)
		await nextTick()
		await nextTick()

		expect(element.querySelector('[aria-label="Insert component"]')).not.toBeNull()
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
	})

	it('renders the component label in the block card while preserving the serialized name', async () => {
		const { element, input } = mountEditor('::Callout\n::', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [{ name: 'Callout', label: 'Highlight box', nodeType: 'block' }],
		})
		await nextTick()
		await nextTick()

		expect(element.querySelector('.mdc-block__identity strong')?.textContent).toBe(
			'Highlight box',
		)
		expect(input).not.toHaveBeenCalled()

		element
			.querySelector('[aria-label="Component actions"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		const settings = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Settings',
		)
		settings?.click()
		await nextTick()

		expect(element.textContent).toContain('Highlight box')
		expect(element.textContent).not.toContain('Unsupported component')
	})

	it('reports stale component properties and routes refresh through the component drawer', async () => {
		const { element, input } = mountEditor('::Card{obsolete="value"}\n::', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [
				{
					name: 'Card',
					nodeType: 'block',
					props: {
						title: { required: true },
						oldTone: {
							tags: [{ name: 'deprecated', text: 'Use tone instead.' }],
						},
					},
					slots: ['content'],
				},
			],
		})
		await nextTick()
		await nextTick()
		await nextTick()

		expect(element.textContent).toContain('Some components need attention.')
		expect(input).not.toHaveBeenCalled()
		const showReport = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Show report',
		)
		showReport?.click()
		await nextTick()
		expect(element.textContent).toContain('New properties: title')
		expect(element.textContent).toContain('Removed properties: obsolete')
		expect(element.textContent).toContain('New slots: content')
		expect(element.querySelectorAll('.component-props-report__changes li')).toHaveLength(3)
		expect(element.querySelector('.component-props-report__status--warning')).not.toBeNull()
		expect(element.querySelector('.mdc-block--warning')).not.toBeNull()

		const review = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Review',
		)
		review?.click()
		await nextTick()
		expect(element.textContent).toContain('Refresh properties')
		expect(element.textContent).toContain('Refresh slots')
		expect(element.textContent).toContain('Deprecated')
		expect(element.textContent).toContain('Use tone instead.')
		expect(input).not.toHaveBeenCalled()
	})

	it('marks removed components as errors and exposes only deletion', async () => {
		const { element } = mountEditor('::Removed\n::', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [],
		})
		await nextTick()
		await nextTick()
		await nextTick()

		expect(element.querySelector('.mdc-block--error')).not.toBeNull()
		element
			.querySelector('[aria-label="Component actions"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()
		expect(element.textContent).not.toContain('Settings')
		expect(element.textContent).not.toContain('Duplicate')
		expect(element.textContent).toContain('Delete')
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
			undefined,
			{
				useStaticComponentMeta: true,
				staticComponentMeta: [{ name: 'Callout', nodeType: 'block' }],
			},
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

	it('edits Markdown source and emits the resulting canonical document', async () => {
		const { element, input } = mountEditor('# Before')
		await nextTick()
		await nextTick()

		element.querySelector<HTMLButtonElement>('[aria-label="Edit Markdown source"]')?.click()
		await nextTick()
		const source = element.querySelector<HTMLTextAreaElement>('[aria-label="Markdown source"]')
		expect(source?.value).toBe('# Before\n\n')
		if (!source) return
		source.value = '# After\n\nUpdated **content**.'
		source.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()
		const apply = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Apply source',
		)
		expect(apply?.hasAttribute('disabled')).toBe(false)
		apply?.click()
		await nextTick()

		expect(input.mock.lastCall?.[0]).toBe('# After\n\nUpdated **content**.')
		expect(element.querySelector('[role="textbox"]')?.textContent).toContain('After')
	})

	it('requires explicit confirmation before applying normalized source', async () => {
		const { element, input } = mountEditor('# Before')
		await nextTick()
		await nextTick()
		element.querySelector<HTMLButtonElement>('[aria-label="Edit Markdown source"]')?.click()
		await nextTick()
		const source = element.querySelector<HTMLTextAreaElement>('[aria-label="Markdown source"]')
		if (!source) return
		source.value = '# After   '
		source.dispatchEvent(new Event('input', { bubbles: true }))
		await nextTick()

		expect(element.textContent).toContain('cannot represent this source exactly')
		const apply = [...element.querySelectorAll('button')].find(
			(button) => button.textContent?.trim() === 'Apply source',
		)
		expect(apply?.hasAttribute('disabled')).toBe(true)
		element.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click()
		await nextTick()
		expect(apply?.hasAttribute('disabled')).toBe(false)
		apply?.click()
		await nextTick()
		expect(input.mock.lastCall?.[0]).toBe('# After\n\n')
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
		const { element } = mountEditor('# Hello', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [
				{ name: 'Hero', nodeType: 'block' },
				{ name: 'Callout', nodeType: 'inline' },
			],
		})
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

	it('opens required prop collection for a component selected through the slash flow', async () => {
		const { element } = mountEditor('# Hello', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [
				{
					name: 'Icon',
					nodeType: 'inline',
					props: {
						name: { type: 'string', required: true },
						mode: { type: 'string', default: 'svg' },
					},
					slots: [],
				},
			],
		})
		await Promise.resolve()
		await nextTick()
		await nextTick()

		element.querySelector('[role="textbox"]')?.dispatchEvent(
			new CustomEvent('markdown-editor-insert-component', {
				detail: { name: 'Icon' },
			}),
		)
		await nextTick()

		expect(element.textContent).toContain('Complete the required fields: name.')
		expect(element.textContent).toContain('Insert')
	})

	it.each(['::Button\n::', '::Button{tone="primary"}\n::'])(
		'does not render an empty content container for a slotless block component',
		async (markdown) => {
			const { element } = mountEditor(markdown)
			await nextTick()
			await nextTick()

			expect(element.querySelector('.mdc-block')).not.toBeNull()
			expect(element.querySelector('.mdc-block__content')).toBeNull()
			if (markdown.includes('tone')) {
				expect(element.querySelector('.mdc-block__props')?.textContent).toContain(
					'tone="primary"',
				)
			}
		},
	)

	it('resolves static component metadata from nested interface options', async () => {
		const { element } = mountEditor('# Hello', false, undefined, {
			options: {
				useStaticComponentMeta: true,
				staticComponentMeta: [{ name: 'NestedComponent', nodeType: 'block' }],
			},
		})
		await Promise.resolve()
		await nextTick()

		element
			.querySelector('[aria-label="Insert component"]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
		await nextTick()

		expect(element.textContent).toContain('NestedComponent')
	})

	it('renders persisted MDC as a polished component view and opens its settings', async () => {
		const { element } = mountEditor(
			'::Callout{tone="warning"}\n#default\nContent\n::',
			false,
			undefined,
			{
				useStaticComponentMeta: true,
				staticComponentMeta: [
					{ name: 'Callout', nodeType: 'block', props: { tone: {} }, slots: ['default'] },
				],
			},
		)
		await nextTick()
		await nextTick()

		expect(element.textContent).not.toContain('MDC component')
		expect(element.textContent).toContain('tone="warning"')
		expect(element.textContent).not.toContain('1 props')
		expect(element.textContent).not.toContain('1 slots')
		expect(element.querySelector('.mdc-slot-view__label')?.textContent?.trim()).toBe('default')
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
		expect(element.textContent).not.toContain('Refresh properties')
		expect(element.textContent).not.toContain('Highlighted supporting content.')
		expect(element.textContent).not.toContain('Slots:')
	})

	it('opens an inline component directly without a separate settings icon', async () => {
		const { element } = mountEditor('Before :Icon{name="check"} after', false, undefined, {
			useStaticComponentMeta: true,
			staticComponentMeta: [
				{
					name: 'Icon',
					label: 'Icon symbol',
					nodeType: 'inline',
					props: { name: { required: true } },
				},
			],
		})
		await nextTick()
		await nextTick()

		const component = element.querySelector('[aria-label="Configure Icon symbol component"]')
		expect(component).not.toBeNull()
		expect(component?.textContent).toContain('Icon symbol')
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
		for (const label of ['Blockquote', 'Edit link', 'Insert image', 'Insert video']) {
			expect(element.querySelector(`[aria-label="${label}"]`)?.hasAttribute('disabled')).toBe(
				true,
			)
		}
		expect(element.querySelector('[aria-label="Insert component"]')).toBeNull()
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
