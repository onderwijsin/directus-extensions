import { createApp, defineComponent, h, nextTick, type Component, type SetupContext } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

import SluggernautInput from '../src/shared/components/SluggernautInput.vue'
import LinkDisplay from '../src/sluggernaut-link/display.vue'
import PermalinkInterface from '../src/sluggernaut-permalink/interface.vue'
import SlugInterface from '../src/sluggernaut-slug/interface.vue'

const VInput = defineComponent({
	props: {
		modelValue: { type: String, default: '' },
		disabled: { type: Boolean, default: false },
		placeholder: { type: String, default: '' },
		error: { type: Boolean, default: false },
	},
	emits: ['update:modelValue'],
	setup(props, { emit }) {
		return () =>
			h('input', {
				value: props.modelValue,
				disabled: props.disabled,
				placeholder: props.placeholder,
				'aria-invalid': props.error,
				onInput: (event: Event) => {
					if (!props.disabled) {
						emit('update:modelValue', (event.target as HTMLInputElement).value)
					}
				},
			})
	},
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
						emit('click')
					},
				},
				slots.default?.(),
			)
	},
})

const VIcon = defineComponent({
	props: { name: { type: String, required: true } },
	setup(props) {
		return () => h('span', { 'data-icon': props.name })
	},
})

function mount(component: Component, props: Record<string, unknown> = {}) {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(component, props)
	app.component('v-input', VInput)
	app.component('v-button', VButton)
	app.component('v-icon', VIcon)
	app.mount(element)

	return {
		app,
		element,
		input: () => element.querySelector('input'),
		button: (label: string) =>
			[...element.querySelectorAll('button')].find(
				(button) => button.getAttribute('aria-label') === label,
			),
	}
}

afterEach(() => {
	document.body.replaceChildren()
})

describe('SluggernautInput', () => {
	it('starts locked, shows the locale placeholder, and emits only after unlocking', async () => {
		const emitted = vi.fn()
		const { app, element, input, button } = mount(SluggernautInput, {
			value: null,
			fieldType: 'slug',
			locale: 'nl',
			onInput: emitted,
		})

		expect(input()?.disabled).toBe(true)
		expect(input()?.placeholder).toBe('De slug wordt automatisch gegenereerd')
		expect(element.querySelector('[data-icon="lock"]')).not.toBeNull()

		input()?.dispatchEvent(new Event('input', { bubbles: true }))
		expect(emitted).not.toHaveBeenCalled()

		button('Unlock field')?.click()
		await nextTick()
		expect(input()?.disabled).toBe(false)
		expect(element.querySelector('[data-icon="lock_open"]')).not.toBeNull()

		input()!.value = 'edited-slug'
		input()?.dispatchEvent(new Event('input', { bubbles: true }))
		expect(emitted).toHaveBeenCalledWith('edited-slug')
		app.unmount()
	})

	it('keeps disabled and non-editable fields inert and renders null without a copy action', () => {
		const disabled = mount(SluggernautInput, {
			value: null,
			fieldType: 'path',
			generateFromSlug: true,
			disabled: true,
		})
		expect(disabled.input()?.disabled).toBe(true)
		expect(disabled.input()?.placeholder).toBe('Path will be auto generated')
		expect(disabled.element.querySelector('.sluggernaut-copy-button')).toBeNull()
		disabled.app.unmount()

		const nonEditable = mount(SluggernautInput, {
			value: 'existing/path',
			fieldType: 'path',
			nonEditable: true,
		})
		expect(nonEditable.input()?.disabled).toBe(true)
		expect(nonEditable.button('Unlock field')).toBeUndefined()
		expect(nonEditable.element.querySelector('.sluggernaut-copy-button')).not.toBeNull()
		nonEditable.app.unmount()
	})

	it('relocks after editing', async () => {
		const { app, input, button } = mount(SluggernautInput, {
			value: 'initial',
			fieldType: 'slug',
		})
		button('Unlock field')?.click()
		await nextTick()
		button('Lock field')?.click()
		await nextTick()
		expect(input()?.disabled).toBe(true)
		app.unmount()
	})
})

describe('Sluggernaut interfaces', () => {
	it('passes slug values, locale, and emitted edits through the slug adapter', async () => {
		const { app, input, button } = mount(SlugInterface, {
			value: 'hello-world',
			locale: 'nl',
		})
		expect(input()?.value).toBe('hello-world')
		expect(input()?.placeholder).toBe('De slug wordt automatisch gegenereerd')
		button('Unlock field')?.click()
		await nextTick()
		expect(input()?.disabled).toBe(false)
		app.unmount()
	})

	it('passes permalink locale and generated-from-slug placeholder through the adapter', () => {
		const { app, input } = mount(PermalinkInterface, {
			value: null,
			locale: 'nl',
			generateFromSlug: true,
		})
		expect(input()?.placeholder).toBe('Pad wordt automatisch gegenereerd')
		app.unmount()
	})
})

describe('Sluggernaut link display', () => {
	it('renders the exact stored path and remains safe for null values', () => {
		const populated = mount(LinkDisplay, { value: '/news/Hello%20World' })
		expect(populated.element.querySelector('.sluggernaut-link__value')?.textContent).toBe(
			'/news/Hello%20World',
		)
		expect(populated.button('Open link')).toBeUndefined()
		populated.app.unmount()

		const empty = mount(LinkDisplay, { value: null, host: 'https://example.com' })
		expect(empty.element.querySelector('.sluggernaut-link__value')?.textContent).toBe('—')
		empty.app.unmount()
	})

	it('offers an open action only for a valid HTTP(S) origin', async () => {
		const { app, button } = mount(LinkDisplay, {
			value: '/news/hello',
			host: 'https://example.com',
		})

		await nextTick()
		expect(button('Open link')).toBeDefined()
		app.unmount()
	})

	it('stays inert for malformed values and hosts', () => {
		for (const props of [
			{ value: '/news/hello', host: 'javascript:alert(1)' },
			{ value: '/news/hello?query=not-allowed', host: 'https://example.com' },
			{ value: '/news/hello', host: '//example.com' },
			{ value: '/news/hello', host: 'not a host' },
		]) {
			const { app, button } = mount(LinkDisplay, props)
			expect(button('Open link')).toBeUndefined()
			app.unmount()
		}
	})
})
