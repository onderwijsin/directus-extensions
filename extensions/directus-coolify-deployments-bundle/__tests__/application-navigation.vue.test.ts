import { createApp, defineComponent, h } from 'vue'

import { describe, expect, it } from 'vitest'

import ApplicationNavigation from '../src/coolify-deployments-module/components/ApplicationNavigation.vue'

/**
 * Mount navigation with link-shaped Directus list stubs.
 * @param selectedId - Selected application ID, including on deployment detail routes.
 * @returns Mounted application and navigation element.
 */
function mountNavigation(selectedId?: string) {
	const element = document.createElement('div')
	const app = createApp(ApplicationNavigation, {
		applications: [
			{ directusApplicationId: 'frontend/preview', name: 'Preview frontend' },
			{ directusApplicationId: 'production', name: 'Production frontend' },
		],
		selectedId,
	})
	const container = defineComponent({
		setup(_props, { slots }) {
			return () => h('div', slots.default?.())
		},
	})
	for (const name of ['v-list', 'v-list-item-icon', 'v-list-item-content', 'v-icon']) {
		app.component(name, container)
	}
	app.component(
		'v-list-item',
		defineComponent({
			props: {
				to: { type: String, required: true },
				active: Boolean,
			},
			setup(props, { slots }) {
				return () =>
					h(
						'a',
						{
							href: props.to,
							'aria-current': props.active ? 'page' : undefined,
						},
						slots.default?.(),
					)
			},
		}),
	)
	app.component(
		'v-text-overflow',
		defineComponent({
			props: { text: { type: String, required: true } },
			setup(props) {
				return () => h('span', props.text)
			},
		}),
	)
	app.mount(element)
	return { app, element }
}

describe('application navigation', () => {
	it('links to the dashboard and encoded application history routes', () => {
		const { app, element } = mountNavigation()
		try {
			expect(element.querySelector('nav')?.getAttribute('aria-label')).toBe('Deployments')
			expect(element.querySelector('[aria-current="page"]')?.textContent).toBe(
				'All deployments',
			)
			expect(element.querySelector('a')?.getAttribute('href')).toBe('/coolify-deployments')
			expect(
				element.querySelector(
					'a[href="/coolify-deployments/applications/frontend%2Fpreview"]',
				)?.textContent,
			).toBe('Preview frontend')
		} finally {
			app.unmount()
		}
	})

	it('highlights only the selected application for history and deployment detail views', () => {
		const { app, element } = mountNavigation('production')
		try {
			expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
			expect(element.querySelector('[aria-current="page"]')?.textContent).toBe(
				'Production frontend',
			)
		} finally {
			app.unmount()
		}
	})
})
