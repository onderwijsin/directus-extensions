import type { AddressValue, InterfaceProps } from '../src/mapbox-address-interface/utils/types'

import { createApp, defineComponent, h, nextTick, reactive } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Interface from '../src/mapbox-address-interface/interface.vue'
import { normalizeFeature } from '../src/mapbox-address-interface/utils/normalize'
import { interfaceOptionsSchema } from '../src/mapbox-address-interface/utils/options.schema'
import { mapboxFeatureSchema } from '../src/mapbox-address-interface/utils/response.schema'
import { feature, response } from './fixtures/address'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('ofetch', async (original) => ({
	...(await original<typeof import('ofetch')>()),
	ofetch: mocks.request,
}))
vi.mock('@directus/extensions-sdk', () => ({
	useStores: () => ({ useSettingsStore: () => ({ settings: { mapbox_key: 'pk.synthetic' } }) }),
}))
const mounted: { app: ReturnType<typeof createApp>; element: HTMLElement }[] = []

function mount(overrides: InterfaceProps = {}) {
	const props = reactive<InterfaceProps>({ showMap: false, debounceMs: 300, ...overrides })
	const emitted: (AddressValue | null)[] = []
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp({
		render: () =>
			h(Interface, {
				...props,
				onInput: (value: AddressValue | null) => emitted.push(value),
			}),
	})
	app.component(
		'VInput',
		defineComponent({
			inheritAttrs: false,
			props: { modelValue: String, disabled: Boolean, nonEditable: Boolean },
			emits: ['update:modelValue', 'focus', 'keydown'],
			setup(props, { attrs, emit, slots }) {
				return () =>
					h('div', { class: 'v-input' }, [
						slots.prepend?.(),
						h('input', {
							...attrs,
							value: props.modelValue,
							disabled: props.disabled,
							onInput: (event: Event) => {
								if (event.target instanceof HTMLInputElement)
									emit('update:modelValue', event.target.value)
							},
							onFocus: (event: Event) => emit('focus', event),
							onKeydown: (event: KeyboardEvent) => emit('keydown', event),
						}),
					])
			},
		}),
	)
	app.component(
		'VIcon',
		defineComponent({
			props: { name: String, size: Number },
			setup(props) {
				return () => h('span', { 'data-icon': props.name })
			},
		}),
	)
	app.component(
		'VProgressCircular',
		defineComponent({
			props: { indeterminate: Boolean, small: Boolean },
			setup() {
				return () => h('span', { role: 'progressbar' })
			},
		}),
	)
	app.component(
		'VMenu',
		defineComponent({
			props: { modelValue: Boolean, attached: Boolean, disabled: Boolean },
			emits: ['update:modelValue'],
			setup(props, { slots }) {
				return () =>
					h('div', [slots.activator?.(), props.modelValue ? slots.default?.() : null])
			},
		}),
	)
	app.component(
		'VButton',
		defineComponent({
			props: { secondary: Boolean, type: String },
			setup(props, { slots }) {
				return () => h('button', { type: props.type }, slots.default?.())
			},
		}),
	)
	app.component(
		'VNotice',
		defineComponent({
			props: { type: String },
			setup(props, { slots }) {
				return () => h('div', { class: ['v-notice', props.type] }, slots.default?.())
			},
		}),
	)
	for (const [name, tag] of [
		['VList', 'ul'],
		['VListItem', 'li'],
	]) {
		if (!name || !tag) continue
		app.component(
			name,
			defineComponent({
				props: { active: Boolean, clickable: Boolean },
				setup(_props, { slots }) {
					return () => h(tag, slots.default?.())
				},
			}),
		)
	}
	app.mount(element)
	mounted.push({ app, element })
	const input = element.querySelector('input')
	if (!input) throw new Error('Missing search input')
	return { props, emitted, element, input }
}
async function type(input: HTMLInputElement, value: string) {
	input.dispatchEvent(new FocusEvent('focus'))
	input.value = value
	input.dispatchEvent(new Event('input', { bubbles: true }))
	await nextTick()
}
async function settle() {
	await vi.advanceTimersByTimeAsync(300)
	await nextTick()
}

beforeEach(() => {
	vi.useFakeTimers()
	mocks.request.mockReset()
	mocks.request.mockResolvedValue(response)
})
afterEach(() => {
	for (const { app, element } of mounted.splice(0)) {
		app.unmount()
		element.remove()
	}
	vi.useRealTimers()
})

describe('Mapbox address editor', () => {
	it('debounces, passes v6 configuration, emits only on explicit keyboard selection and preserves provenance', async () => {
		const { input, emitted, element } = mount({
			permanent: false,
			countries: ['NL'],
			proximity: [4.9, 52.3],
			resultLimit: 3,
		})
		await type(input, 'Ex')
		await settle()
		expect(mocks.request).not.toHaveBeenCalled()
		await type(input, 'Example')
		await settle()
		expect(mocks.request).toHaveBeenCalledWith(
			'https://api.mapbox.com/search/geocode/v6/forward',
			{
				query: expect.objectContaining({
					permanent: false,
					access_token: 'pk.synthetic',
					country: 'NL',
					proximity: '4.9,52.3',
					limit: 3,
				}),
			},
		)
		expect(emitted).toEqual([])
		expect(element.textContent).not.toContain('Synthetic Mapbox attribution')
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(emitted).toEqual([])
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
		await nextTick()
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		await nextTick()
		expect(emitted[0]?.storageMode).toBe('temporary')
		expect(emitted[0]?.formattedAddress).toBe('Example Street 10, Example City')
		expect(element.textContent).not.toContain('4.9, 52.3')
		expect(input.value).toBe('Example Street 10, Example City')
		expect(element.querySelector('.selected')).toBeNull()
	})
	it('selects a result through the Directus list and displays Directus notices', async () => {
		const state = mount()
		await type(state.input, 'Example')
		await settle()
		const candidate = state.element.querySelector<HTMLElement>('[role=option]')
		if (!candidate) throw new Error('Missing address result')
		candidate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
		expect(state.emitted).toEqual([])
		candidate.click()
		await nextTick()
		expect(state.emitted).toHaveLength(1)
		expect(state.emitted[0]?.mapboxId).toBe('synthetic-address')
		expect(state.element.querySelector('[role=option]')).toBeNull()
		state.props.mapboxKey = 'sk.invalid'
		await nextTick()
		expect(state.element.querySelector('.v-notice.warning')?.textContent).toContain(
			'browser-public',
		)
	})
	it('searches places by default and selects a town with partial address components', async () => {
		mocks.request.mockResolvedValueOnce({
			...response,
			features: [
				{
					...feature,
					properties: {
						mapbox_id: 'synthetic-place',
						feature_type: 'place',
						name: 'Example City',
						full_address: 'Example City, Example Country',
						context: {
							place: { name: 'Example City' },
							country: { name: 'Example Country', country_code: 'nl' },
						},
					},
				},
			],
		})
		const state = mount({ countries: ['NL'], language: 'nl' })
		await type(state.input, 'Example City')
		await settle()
		expect(mocks.request).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				query: expect.objectContaining({
					types: 'address,street,place',
					country: 'NL',
					language: 'nl',
				}),
			}),
		)
		state.element.querySelector<HTMLElement>('[role=option]')?.click()
		await nextTick()
		expect(state.emitted).toMatchObject([
			{
				featureType: 'place',
				components: { address: null, city: 'Example City', countryCode: 'NL' },
			},
		])
	})
	it('renders saved/external values without fetching or emitting and supports explicit clearing', async () => {
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({}),
		)
		const { props, input, emitted, element } = mount({ value })
		await settle()
		expect(mocks.request).not.toHaveBeenCalled()
		expect(emitted).toEqual([])
		expect(input.value).toBe(value.formattedAddress)
		input.dispatchEvent(new FocusEvent('focus'))
		await settle()
		expect(mocks.request).not.toHaveBeenCalled()
		props.value = { ...value, formattedAddress: 'External edit' }
		await nextTick()
		expect(input.value).toBe('External edit')
		expect(emitted).toEqual([])
		await type(input, 'Replacement query')
		expect(element.querySelector('button')).not.toBeNull()
		element.querySelector('button')?.click()
		await nextTick()
		expect(emitted).toEqual([null])
		expect(input.value).toBe('')
		expect(element.querySelector('button')).toBeNull()
	})
	it('shows loading in the input and discards an in-flight result after clearing the saved value', async () => {
		let complete: ((value: unknown) => void) | undefined
		mocks.request.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					complete = resolve
				}),
		)
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({}),
		)
		const state = mount({ value })
		expect(state.element.querySelector('[data-icon=search]')).not.toBeNull()
		await type(state.input, 'Replacement address')
		await settle()
		expect(state.element.querySelector('.v-input [role=progressbar]')).not.toBeNull()
		expect(state.element.querySelector('[data-icon=search]')).toBeNull()
		state.element.querySelector('button')?.click()
		await nextTick()
		expect(state.emitted).toEqual([null])
		expect(state.input.value).toBe('')
		expect(state.element.querySelector('[role=progressbar]')).toBeNull()
		expect(state.element.querySelector('[data-icon=search]')).not.toBeNull()
		complete?.(response)
		await settle()
		expect(state.element.querySelector('[role=listbox]')).toBeNull()
		expect(state.input.value).toBe('')
		expect(state.emitted).toEqual([null])
	})
	it('keeps a persisted selection when clearing is disabled and hides clear for search-only text', async () => {
		const value = normalizeFeature(
			mapboxFeatureSchema.parse(feature),
			interfaceOptionsSchema.parse({}),
		)
		const state = mount({ value, allowClear: false })
		expect(state.element.querySelector('button')).toBeNull()
		await type(state.input, 'Another address')
		await settle()
		expect(state.emitted).toEqual([])
		expect(state.element.querySelector('button')).toBeNull()
		state.props.value = null
		state.props.allowClear = true
		await nextTick()
		await type(state.input, 'Search text only')
		await settle()
		expect(state.element.querySelector('button')).toBeNull()
		expect(state.emitted).toEqual([])
	})

	it('dismisses empty results with Escape without changing the saved value', async () => {
		mocks.request.mockResolvedValueOnce({ ...response, features: [] })
		const state = mount({ featureTypes: ['address'] })
		await type(state.input, 'Unknown town')
		await settle()
		expect(state.element.querySelector('[role=listbox]')?.textContent).toContain(
			'For town searches, enable Place',
		)
		expect(state.element.querySelector('.feedback')?.textContent).not.toContain(
			'No addresses found',
		)
		state.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
		expect(state.emitted).toEqual([])
		state.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await nextTick()
		expect(state.element.querySelector('[role=listbox]')).toBeNull()
		expect(state.emitted).toEqual([])
	})

	it('does not search or clear disabled/noneditable fields and validates options and saved values', async () => {
		const state = mount({ disabled: true, value: { schemaVersion: 999 } })
		await type(state.input, 'Example')
		await settle()
		expect(mocks.request).not.toHaveBeenCalled()
		expect(state.element.querySelector('button')).toBeNull()
		expect(state.element.textContent).toContain('saved address is invalid')
		state.props.disabled = false
		state.props.nonEditable = true
		await nextTick()
		await type(state.input, 'Example')
		await settle()
		expect(mocks.request).not.toHaveBeenCalled()
		state.props.nonEditable = false
		state.props.resultLimit = 100
		await nextTick()
		await type(state.input, 'Example')
		await settle()
		expect(state.element.textContent).toContain('Invalid Mapbox interface options')
	})
	it('ignores superseded results and refreshes when configuration changes', async () => {
		let completeOld: ((value: unknown) => void) | undefined
		mocks.request.mockImplementationOnce(
			() =>
				new Promise<unknown>((resolve) => {
					completeOld = resolve
				}),
		)
		const state = mount()
		await type(state.input, 'Old address')
		await settle()
		await type(state.input, 'New address')
		await settle()
		completeOld?.({
			...response,
			features: [
				{ ...feature, properties: { ...feature.properties, full_address: 'STALE' } },
			],
		})
		await nextTick()
		await nextTick()
		expect(state.element.textContent).not.toContain('STALE')
		state.props.permanent = false
		await nextTick()
		expect(state.element.querySelector('[role=option]')).toBeNull()
		await settle()
		expect(mocks.request).toHaveBeenLastCalledWith(
			expect.any(String),
			expect.objectContaining({ query: expect.objectContaining({ permanent: false }) }),
		)
	})
	it('shows empty/network feedback without exposing provider errors or secrets', async () => {
		const state = mount()
		mocks.request.mockResolvedValueOnce({ ...response, features: [] })
		await type(state.input, 'Example')
		await settle()
		expect(state.element.querySelector('[role=listbox]')?.textContent).toContain(
			'No addresses found',
		)
		expect(state.element.querySelector('[role=combobox]')?.getAttribute('aria-expanded')).toBe(
			'true',
		)
		expect(state.element.querySelector('button')).toBeNull()
		state.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
		expect(state.emitted).toEqual([])
		mocks.request.mockRejectedValueOnce(new Error('TOKEN=secret&address=private'))
		await type(state.input, 'Another')
		await settle()
		expect(state.element.textContent).toContain('Address search failed')
		expect(state.element.textContent).not.toContain('TOKEN=secret')
	})
})
