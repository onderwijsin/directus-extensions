import { createApp, defineComponent, h, type Component, type SetupContext } from 'vue'

import { afterEach, describe, expect, it } from 'vitest'

import ApplicationStateBadge from '../src/coolify-deployments-module/components/ApplicationStateBadge.vue'
import DeploymentStatus from '../src/coolify-deployments-module/components/DeploymentStatus.vue'

const mount = (component: Component, props: Record<string, unknown>) => {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(component, props)
	app.component(
		'v-chip',
		defineComponent({
			inheritAttrs: false,
			setup(_props: Record<string, unknown>, { slots }: SetupContext) {
				return () => h('span', slots.default?.())
			},
		}),
	)
	app.component(
		'v-icon',
		defineComponent({
			inheritAttrs: false,
			setup() {
				return () => h('i')
			},
		}),
	)
	app.mount(element)
	return { app, element }
}

afterEach(() => {
	document.body.replaceChildren()
})

describe('deployment status components', () => {
	it('renders the visible label for every deployment status', () => {
		for (const [status, label] of [
			['queued', 'Queued'],
			['building', 'Building'],
			['ready', 'Ready'],
			['error', 'Error'],
			['canceled', 'Canceled'],
		] as const) {
			const { app, element } = mount(DeploymentStatus, { status })
			expect(element.textContent).toContain(label)
			app.unmount()
		}
	})

	it('normalizes provider state labels and classes', () => {
		const { app, element } = mount(ApplicationStateBadge, { state: 'running:healthy' })

		expect(element.textContent).toContain('Running')
		app.unmount()
	})
})
