import { createApp, defineComponent, h, type SetupContext } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get: mocks.get }) }))

import ApplicationSelect from '../src/coolify-deploy-application-select/interface.vue'

const mount = (props: Record<string, unknown>) => {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(ApplicationSelect, props)
	app.component(
		'VSelect',
		defineComponent({
			inheritAttrs: false,
			props: {
				modelValue: { type: String, default: null },
				items: { type: Array, default: () => [] },
			},
			emits: ['update:modelValue'],
			setup(componentProps: Record<string, unknown>, _context: SetupContext) {
				return () =>
					h('select', { 'data-value': componentProps.modelValue }, [
						h('option', { value: '' }, 'Select an application'),
					])
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

describe('Coolify application select', () => {
	beforeEach(() => vi.clearAllMocks())

	it('shows loading and then the selected application', async () => {
		let resolve: (value: { data: { id: string; name: string }[] }) => void = () => undefined
		mocks.get.mockReturnValueOnce(new Promise((res) => (resolve = res)))
		const { app, element } = mount({ value: 'frontend' })
		expect(element.textContent).not.toContain('No enabled')

		resolve({ data: [{ id: 'frontend', name: 'Frontend' }] })
		await vi.waitFor(() =>
			expect(mocks.get).toHaveBeenCalledWith('/coolify-deployments/operation/applications'),
		)
		await vi.waitFor(() =>
			expect(element.querySelector('[data-value="frontend"]')).not.toBeNull(),
		)
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
		failed.app.unmount()
	})
})
