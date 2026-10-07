import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get: mocks.get }) }))

import OperationOptions from '../src/coolify-deploy-operation/options.vue'

const mount = (props: Record<string, unknown>) => {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(
		defineComponent({
			setup: () => () => h(OperationOptions, { ...props }),
		}),
	)
	app.component(
		'VSelect',
		defineComponent({
			inheritAttrs: false,
			props: {
				modelValue: { type: String, default: null },
				items: { type: Array, default: () => [] },
			},
			emits: ['update:modelValue'],
			setup(componentProps, { attrs, emit }) {
				return () =>
					h(
						'select',
						{
							...attrs,
							value: componentProps.modelValue,
							onChange: (event: Event) => {
								if (event.target instanceof HTMLSelectElement) {
									emit('update:modelValue', event.target.value || null)
								}
							},
						},
						[
							h('option', { value: '' }, 'Select an application'),
							...componentProps.items.flatMap((item) => {
								if (
									typeof item !== 'object' ||
									item === null ||
									!('text' in item) ||
									!('value' in item) ||
									typeof item.text !== 'string' ||
									typeof item.value !== 'string'
								)
									return []
								return [h('option', { value: item.value }, item.text)]
							}),
						],
					)
			},
		}),
	)
	app.component(
		'v-notice',
		defineComponent({
			setup:
				(_props, { slots }) =>
				() =>
					h('p', slots.default?.()),
		}),
	)
	app.mount(element)
	return { app, element }
}

afterEach(() => document.body.replaceChildren())

describe('Coolify operation options', () => {
	beforeEach(() => vi.clearAllMocks())

	it('shows loading and then the selected application', async () => {
		let resolve: (value: { data: { id: string; name: string }[] }) => void = () => undefined
		mocks.get.mockReturnValueOnce(new Promise((res) => (resolve = res)))
		const { app, element } = mount({ value: { application: 'frontend' } })
		expect(element.textContent).not.toContain('No enabled')
		expect(element.querySelector('select')?.disabled).toBe(true)
		expect(element.querySelector('select')?.getAttribute('loading')).toBe('true')
		expect(element.textContent).toContain('Select an enabled, deploy-enabled application.')

		resolve({ data: [{ id: 'frontend', name: 'Frontend' }] })
		await vi.waitFor(() =>
			expect(mocks.get).toHaveBeenCalledWith('/coolify-deployments/operation/applications'),
		)
		await vi.waitFor(() => expect(element.querySelector('select')?.value).toBe('frontend'))
		expect(element.querySelector('select')?.disabled).toBe(false)
		expect(element.textContent).toContain('Frontend')
		app.unmount()
	})

	it('shows empty and request-error states', async () => {
		mocks.get.mockResolvedValueOnce({ data: [] })
		const empty = mount({})
		await vi.waitFor(() => expect(empty.element.textContent).toContain('No enabled'))
		empty.app.unmount()

		mocks.get.mockRejectedValueOnce(new Error('unavailable'))
		const failed = mount({})
		await vi.waitFor(() => expect(failed.element.textContent).toContain('Unable to load'))
		expect(failed.element.querySelector('select')?.disabled).toBe(true)
		failed.app.unmount()
	})

	it.each(['empty', 'error'])(
		'preserves a stale selection after an %s response',
		async (state) => {
			if (state === 'empty') mocks.get.mockResolvedValueOnce({ data: [] })
			else mocks.get.mockRejectedValueOnce(new Error('unavailable'))
			const input = vi.fn()
			const { app, element } = mount({ value: { application: 'removed' }, onInput: input })
			await vi.waitFor(() =>
				expect(element.textContent).toContain(
					state === 'empty' ? 'No enabled' : 'Unable to load',
				),
			)
			expect(element.querySelector('select')?.value).toBe('removed')
			expect(element.textContent).toContain('removed')
			expect(input).not.toHaveBeenCalled()
			app.unmount()
		},
	)

	it('emits full options for selection and clearing, and follows parent updates', async () => {
		mocks.get.mockResolvedValueOnce({ data: [{ id: 'frontend', name: 'Frontend' }] })
		const original = Object.freeze({ application: 'old', preserved: 'keep' })
		const value = shallowRef<{ application: string; preserved: string }>(original)
		const input = vi.fn((options: { application: string; preserved: string }) => {
			value.value = options
		})
		const { app, element } = mount({
			get value() {
				return value.value
			},
			onInput: input,
		})
		await vi.waitFor(() => expect(element.querySelector('select')?.disabled).toBe(false))
		const select = element.querySelector('select')
		if (!select) throw new Error('Application select is missing')
		select.value = 'frontend'
		select.dispatchEvent(new Event('change'))
		expect(input).toHaveBeenLastCalledWith({ application: 'frontend', preserved: 'keep' })
		expect(original.application).toBe('old')
		await nextTick()
		expect(select.value).toBe('frontend')
		value.value = { application: 'parent-update', preserved: 'keep' }
		await nextTick()
		expect(select.value).toBe('parent-update')
		expect(input).toHaveBeenCalledTimes(1)
		select.value = ''
		select.dispatchEvent(new Event('change'))
		expect(input).toHaveBeenLastCalledWith({ application: '', preserved: 'keep' })
		app.unmount()
	})

	it('initializes omitted options on selection', async () => {
		mocks.get.mockResolvedValueOnce({ data: [{ id: 'frontend', name: 'Frontend' }] })
		const input = vi.fn()
		const { app, element } = mount({ onInput: input })
		await vi.waitFor(() => expect(element.querySelector('select')?.disabled).toBe(false))
		const select = element.querySelector('select')
		if (!select) throw new Error('Application select is missing')
		select.value = 'frontend'
		select.dispatchEvent(new Event('change'))
		expect(input).toHaveBeenCalledWith({ application: 'frontend' })
		app.unmount()
	})
})
