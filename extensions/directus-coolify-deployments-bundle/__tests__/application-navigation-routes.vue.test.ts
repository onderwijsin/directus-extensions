import { createApp, defineComponent, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import { expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get: mocks.get }) }))

import { useApplicationNavigation } from '../src/coolify-deployments-module/composables/useApplicationNavigation'
import ModuleView from '../src/coolify-deployments-module/ModuleView.vue'

it('shares navigation between child routes and resets it after leaving the module', async () => {
	mocks.get.mockResolvedValue({ data: [], headers: {} })
	const child = defineComponent({
		setup() {
			const navigation = useApplicationNavigation()
			onMounted(() => void navigation.ensureApplications())
			return () => h('p', String(navigation.applications.value.length))
		},
	})
	const otherChild = defineComponent({
		setup() {
			const navigation = useApplicationNavigation()
			onMounted(() => void navigation.ensureApplications())
			return () => h('p', String(navigation.applications.value.length))
		},
	})
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{
				path: '/coolify-deployments',
				component: ModuleView,
				children: [
					{ path: '', component: child },
					{ path: 'applications/:id/deployments/:deploymentId', component: otherChild },
				],
			},
			{ path: '/outside', component: defineComponent({ render: () => h('p', 'Outside') }) },
		],
	})
	const element = document.createElement('div')
	const app = createApp(RouterView)
	app.use(router)
	await router.push('/coolify-deployments')
	await router.isReady()
	app.mount(element)
	try {
		await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1))
		await router.push('/coolify-deployments/applications/app-1/deployments/deploy-1')
		expect(element.textContent).toBe('0')
		expect(mocks.get).toHaveBeenCalledTimes(1)
		await router.push('/outside')
		await router.push('/coolify-deployments/applications/app-1/deployments/deploy-2')
		await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
	} finally {
		app.unmount()
	}
})
