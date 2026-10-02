import { createApp, defineComponent, h } from 'vue'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@iconify/vue', () => ({
	addAPIProvider: vi.fn(),
	Icon: defineComponent({
		props: { icon: { type: String, required: true } },
		setup: (props) => () => h('span', { 'data-icon': props.icon }),
	}),
}))

import IconifyDisplay from '../src/iconify-display/display.vue'

function mount(props: { value?: string | null; useProxy?: boolean }) {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(IconifyDisplay, props)
	app.mount(element)
	return { app, element }
}

afterEach(() => document.body.replaceChildren())

describe('Iconify display', () => {
	it('renders a valid icon through the proxy by default', () => {
		const { app, element } = mount({ value: 'mdi:home' })
		expect(element.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe(
			'@directus-iconify:mdi:home',
		)
		app.unmount()
	})

	it('renders through the public provider when the proxy is disabled', () => {
		const { app, element } = mount({ value: 'mdi:home', useProxy: false })
		expect(element.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe(
			'@directus-iconify-public:mdi:home',
		)
		app.unmount()
	})

	it('renders nothing for an invalid stored icon', () => {
		const { app, element } = mount({ value: 'invalid' })
		expect(element.querySelector('[data-icon]')).toBeNull()
		app.unmount()
	})
})
