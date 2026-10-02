import { createApp, defineComponent, h } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getCollections: vi.fn() }))
vi.mock('../src/shared/useIconifyApi', () => ({ useIconifyApi: () => mocks }))

import IconifyOptions from '../src/iconify-interface/options.vue'

function mount(value: { collections?: string[]; useProxy?: boolean } | null = null) {
	const element = document.createElement('div')
	document.body.append(element)
	const input = vi.fn()
	const app = createApp(IconifyOptions, { value, onInput: input })
	app.component(
		'VCheckbox',
		defineComponent({
			props: { modelValue: Boolean, label: String },
			emits: ['update:modelValue'],
			setup:
				(props, { emit }) =>
				() =>
					h('button', {
						type: 'button',
						'aria-label': props.label,
						'aria-pressed': String(props.modelValue),
						onClick: () => emit('update:modelValue', !props.modelValue),
					}),
		}),
	)
	app.component(
		'VSelect',
		defineComponent({
			emits: ['update:modelValue'],
			setup:
				(_props, { emit }) =>
				() =>
					h('button', {
						type: 'button',
						'aria-label': 'Select collection',
						onClick: () => emit('update:modelValue', ['mdi']),
					}),
		}),
	)
	app.component('VNotice', defineComponent({ setup: () => () => h('p') }))
	app.mount(element)
	return { app, element, input }
}

afterEach(() => document.body.replaceChildren())

describe('Iconify interface options', () => {
	it('defaults to the proxy and emits the direct setting without losing collections', () => {
		mocks.getCollections.mockResolvedValue({ mdi: { name: 'Material Design Icons' } })
		const { app, element, input } = mount({ collections: ['mdi'] })
		const checkbox = element.querySelector<HTMLButtonElement>(
			'button[aria-label="Use proxy for Iconify API"]',
		)
		expect(checkbox?.getAttribute('aria-pressed')).toBe('true')
		checkbox?.click()
		expect(input).toHaveBeenCalledWith({ collections: ['mdi'], useProxy: false })
		app.unmount()
	})

	it('emits selected collections while preserving the direct setting', () => {
		mocks.getCollections.mockResolvedValue({ mdi: { name: 'Material Design Icons' } })
		const { app, element, input } = mount({ useProxy: false })
		element.querySelector<HTMLButtonElement>('button[aria-label="Select collection"]')?.click()
		expect(input).toHaveBeenCalledWith({ useProxy: false, collections: ['mdi'] })
		app.unmount()
	})
})
