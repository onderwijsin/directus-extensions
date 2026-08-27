import { createApp, defineComponent, h, type Component, type SetupContext } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

const clipboard = vi.hoisted(() => ({ copy: vi.fn(), copied: false }))
vi.mock('@vueuse/core', () => ({
	useClipboard: () => ({ ...clipboard, isSupported: true }),
}))

import QuickCopyDisplay from '../src/quick-copy-display/display.vue'
import QuickCopyInput from '../src/quick-copy-interface/interface.vue'

const VInput = defineComponent({
	props: { modelValue: { type: String, default: '' }, disabled: Boolean },
	setup: (props) => () => h('input', { value: props.modelValue, disabled: props.disabled }),
})

const VButton = defineComponent({
	inheritAttrs: false,
	emits: ['click'],
	setup(_props: Record<string, unknown>, { attrs, emit, slots }: SetupContext) {
		const forwardedClick = typeof attrs.onClick === 'function' ? attrs.onClick : undefined
		return () =>
			h(
				'button',
				{
					...attrs,
					type: 'button',
					onClick: (event: MouseEvent) => {
						forwardedClick?.(event)
						emit('click', event)
					},
				},
				slots.default?.(),
			)
	},
})

const VIcon = defineComponent({
	props: { name: { type: String, required: true } },
	setup: (props) => () => h('span', { 'data-icon': props.name }),
})

function mount(component: Component, props: Record<string, unknown>) {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(component, props)
	app.component('v-input', VInput).component('v-button', VButton).component('v-icon', VIcon)
	app.mount(element)
	return { app, element }
}

afterEach(() => {
	document.body.replaceChildren()
	clipboard.copy.mockClear()
})

describe('Quick Copy input', () => {
	it('renders the value in a disabled native input and copies it', () => {
		const { app, element } = mount(QuickCopyInput, { value: 'record-123' })
		const input = element.querySelector('input')
		const button = element.querySelector('button')

		expect(input?.value).toBe('record-123')
		expect(input?.disabled).toBe(true)
		button?.click()
		expect(clipboard.copy).toHaveBeenCalledWith('record-123')
		app.unmount()
	})
})

describe('Quick Copy display', () => {
	it('renders the exact scalar value and copies it', () => {
		const { app, element } = mount(QuickCopyDisplay, { value: 42 })

		expect(element.querySelector('.quick-copy-display__value')?.textContent).toBe('42')
		element.querySelector('button')?.click()
		expect(clipboard.copy).toHaveBeenCalledWith('42')
		app.unmount()
	})

	it('renders an em dash for an empty value', () => {
		const { app, element } = mount(QuickCopyDisplay, { value: null })
		expect(element.querySelector('.quick-copy-display__value')?.textContent).toBe('—')
		app.unmount()
	})
})
