import { createApp, defineComponent, h, nextTick } from 'vue'

import { fileURLToPath } from 'node:url'

import { hasKey, isArray, isRecord } from '@onderwijsin/directus-extension-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { response } from './fixtures/address'

afterEach(() => vi.unstubAllGlobals())

vi.mock('@directus/extensions-sdk', () => ({
	defineInterface: (value: unknown) => value,
	defineOperationApp: (value: unknown) => value,
	useStores: () => ({
		useSettingsStore: () => ({ settings: {} }),
		useUserStore: () => ({ currentUser: { appearance: 'light' } }),
		useServerStore: () => ({ info: null }),
	}),
}))

describe.skipIf(!process.env.GEO_TOOLKIT_BUNDLE_TEST)('built Geo Toolkit interface', () => {
	it('renders the map, searches and selects through the compiled app bundle', async () => {
		const fetch = vi.fn().mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify(response), {
					headers: { 'content-type': 'application/json' },
				}),
			),
		)
		vi.stubGlobal('fetch', fetch)
		const relativePath = '../dist/app.js'
		const moduleUrl = fileURLToPath(new URL(relativePath, import.meta.url))
		const bundle: unknown = await import(moduleUrl)
		if (!isRecord(bundle) || !hasKey(bundle, 'interfaces') || !isArray(bundle.interfaces))
			throw new Error('Missing interface exports')
		const registration = bundle.interfaces.find(
			(value) => isRecord(value) && value.id === 'geo-mapbox-address-interface',
		)
		if (!isRecord(registration) || !isRecord(registration.component))
			throw new Error('Missing Mapbox interface component')
		const component = registration.component
		const element = document.createElement('div')
		document.body.append(element)
		const emitted: unknown[] = []
		const app = createApp({
			render: () =>
				h(component, {
					mapboxKey: 'pk.synthetic',
					mapHeightPx: 320,
					onInput: (value: unknown) => emitted.push(value),
				}),
		})
		const warnings: string[] = []
		app.config.warnHandler = (message) => {
			warnings.push(message)
		}
		app.component(
			'VInput',
			defineComponent({
				inheritAttrs: false,
				props: { modelValue: String, disabled: Boolean, nonEditable: Boolean },
				emits: ['update:modelValue', 'focus', 'keydown'],
				setup(props, { attrs, emit }) {
					return () =>
						h('input', {
							...attrs,
							value: props.modelValue,
							disabled: props.disabled,
							onInput: (event: Event) => {
								if (event.target instanceof HTMLInputElement)
									emit('update:modelValue', event.target.value)
							},
							onFocus: () => emit('focus'),
							onKeydown: (event: KeyboardEvent) => emit('keydown', event),
						})
				},
			}),
		)
		app.component(
			'VButton',
			defineComponent({
				props: { icon: Boolean, secondary: Boolean, type: String },
				setup(props, { slots }) {
					return () => h('button', { type: props.type }, slots.default?.())
				},
			}),
		)
		for (const name of [
			'VIcon',
			'VProgressCircular',
			'VList',
			'VListItem',
			'VNotice',
			'VMenu',
		]) {
			app.component(
				name,
				defineComponent({
					setup(_props, { slots }) {
						return () => h('div', [slots.activator?.(), slots.default?.()])
					},
				}),
			)
		}
		try {
			app.mount(element)
			expect(element.querySelector<HTMLElement>('.address-editor')?.style.minHeight).toBe(
				'320px',
			)
			await vi.waitFor(() =>
				expect(element.querySelector('[aria-label="Selected address map"]')).not.toBeNull(),
			)
			const map = element.querySelector<HTMLElement>('[aria-label="Selected address map"]')
			expect(map?.style.height).toBe('320px')
			expect(element.querySelector<HTMLElement>('.address-editor')?.style.minHeight).toBe(
				'320px',
			)
			const input = element.querySelector('input')
			if (!input) throw new Error('Missing address input')
			input.focus()
			input.value = 'Example Street 10'
			input.dispatchEvent(new Event('input', { bubbles: true }))
			await vi.waitFor(() =>
				expect(element.querySelector('[role=option]')?.textContent).toContain(
					'Example Street 10',
				),
			)
			const requestUrl: unknown = fetch.mock.calls[0]?.[0]
			if (typeof requestUrl !== 'string') throw new Error('Missing geocoding URL')
			expect(new URL(requestUrl).searchParams.get('types')).toBe('address,street,place')
			const candidate = element.querySelector<HTMLElement>('[role=option]')
			candidate?.click()
			await nextTick()
			expect(warnings).toEqual([])
			expect(emitted).toMatchObject([
				{ components: { postcode: '0012 AB' }, geometry: { type: 'Point' } },
			])
			expect(input.value).toBe('Example Street 10, Example City')
			expect(element.querySelector('.selected')).toBeNull()
			expect(element.textContent).not.toContain('Synthetic Mapbox attribution')
			element.querySelector('button')?.click()
			await nextTick()
			expect(input.value).toBe('')
			expect(emitted).toHaveLength(2)
			expect(emitted[1]).toBeNull()
			expect(element.querySelector('button')).toBeNull()
			expect(warnings).toEqual([])
		} finally {
			app.unmount()
			element.remove()
		}
	})
})
