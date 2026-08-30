import { createApp, defineComponent, h, type Component } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
}))

vi.mock('@directus/extensions-sdk', () => ({
	useApi: () => ({ get: mocks.get }),
}))
vi.mock('@comark/vue', () => ({
	Markdown: defineComponent({
		props: { value: { type: String, required: true } },
		setup(props: { value: string }) {
			return () => h('div', { class: 'markdown' }, props.value)
		},
	}),
}))

import DocsArticle from '../src/studio-docs-module/components/DocsArticle.vue'
import DocsNavigation from '../src/studio-docs-module/components/DocsNavigation.vue'
import DocsModule from '../src/studio-docs-module/module.vue'

const article = {
	id: '7b8b3a1e-38f3-4ab7-9b37-5e4c5d7f1234',
	navigation_label: 'Getting started',
	body: '# Getting started',
	sort: 0,
	archived: false,
	icon: 'menu_book',
	user_created: 'user-1',
	date_created: '2026-08-01T10:00:00.000Z',
	date_updated: '2026-08-02T10:00:00.000Z',
}

const PrivateView = defineComponent({
	props: { title: { type: String, default: '' } },
	setup(props, { slots }) {
		return () => h('main', { 'data-title': props.title }, slots.default?.())
	},
})
const VButton = defineComponent({
	inheritAttrs: false,
	setup(_props: Record<string, unknown>, { attrs, slots }) {
		return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
	},
})
const VIcon = defineComponent({
	props: { name: { type: String, required: true } },
	setup(props) {
		return () => h('span', { 'data-icon': props.name })
	},
})
const VList = defineComponent({
	setup(_props, { slots }) {
		return () => h('ul', { class: 'v-list' }, slots.default?.())
	},
})
const VListItem = defineComponent({
	inheritAttrs: false,
	props: { active: { type: Boolean, default: false } },
	setup(props, { attrs, slots }) {
		const path =
			attrs.to &&
			typeof attrs.to === 'object' &&
			'path' in attrs.to &&
			typeof attrs.to.path === 'string'
				? attrs.to.path
				: undefined

		return () =>
			h(
				'button',
				{
					class: { active: props.active },
					type: 'button',
					'data-path': path,
				},
				slots.default?.(),
			)
	},
})
const VListItemIcon = defineComponent({
	setup(_props, { slots }) {
		return () => h('span', { class: 'v-list-item-icon' }, slots.default?.())
	},
})
const VListItemContent = defineComponent({
	setup(_props, { slots }) {
		return () => h('span', { class: 'v-list-item-content' }, slots.default?.())
	},
})
const VTextOverflow = defineComponent({
	props: { text: { type: String, required: true } },
	setup(props) {
		return () => h('span', { class: 'v-text-overflow' }, props.text)
	},
})
const VNotice = defineComponent({
	setup(_props, { slots }) {
		return () => h('p', { class: 'notice' }, slots.default?.())
	},
})
const VInfo = defineComponent({
	props: { title: { type: String, default: '' } },
	setup(props, { slots }) {
		return () => h('section', { class: 'info' }, [h('h2', props.title), slots.default?.()])
	},
})

function mount(component: Component, props: Record<string, unknown> = {}) {
	const element = document.createElement('div')
	document.body.append(element)
	const app = createApp(component, props)
	app.component('private-view', PrivateView)
	app.component('v-button', VButton)
	app.component('v-icon', VIcon)
	app.component('v-list', VList)
	app.component('v-list-item', VListItem)
	app.component('v-list-item-icon', VListItemIcon)
	app.component('v-list-item-content', VListItemContent)
	app.component('v-text-overflow', VTextOverflow)
	app.component('v-notice', VNotice)
	app.component('v-info', VInfo)
	app.mount(element)
	return { app, element }
}

afterEach(() => document.body.replaceChildren())

describe('Studio Docs module', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.get.mockResolvedValue({ data: { data: [article] } })
	})

	it('loads visible articles, renders Markdown, and shows audit details', async () => {
		mocks.get
			.mockResolvedValueOnce({ data: { data: [article] } })
			.mockResolvedValueOnce({ data: { data: article } })
		const { app, element } = mount(DocsModule, { id: article.id })

		await vi.waitFor(() => expect(element.querySelector('.markdown')).not.toBeNull())
		expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('/items/studio_docs?'))
		const navigationUrl = mocks.get.mock.calls[0]?.[0]
		expect(navigationUrl).toContain('fields=id%2Cnavigation_label%2Cicon')
		expect(navigationUrl).toContain('filter%5Barchived%5D%5B_eq%5D=false')
		expect(navigationUrl).toContain('sort=sort%2Cnavigation_label')
		const articleUrl = mocks.get.mock.calls[1]?.[0]
		expect(articleUrl).toContain(`/items/studio_docs/${article.id}?`)
		expect(articleUrl).toContain('fields=id%2Cnavigation_label%2Cbody%2Cicon')
		expect(element.querySelector('[data-title="Getting started"]')).not.toBeNull()
		expect(element.querySelector('.markdown')?.textContent).toContain('# Getting started')
		app.unmount()
	})

	it('shows the empty state when no unarchived articles are returned', async () => {
		mocks.get.mockResolvedValueOnce({
			data: {
				data: [],
			},
		})
		const { app, element } = mount(DocsModule)

		await vi.waitFor(() => expect(element.textContent).toContain('No documentation available'))
		expect(element.textContent).not.toContain('Article details')
		app.unmount()
	})

	it('shows a not-found state for an unavailable or archived route article', async () => {
		mocks.get
			.mockResolvedValueOnce({ data: { data: [article] } })
			.mockRejectedValueOnce(new Error('Article not found'))
		const { app, element } = mount(DocsModule, { id: 'missing-article' })

		await vi.waitFor(() => expect(element.textContent).toContain('Article not found'))
		expect(element.textContent).toContain('unavailable or archived')
		app.unmount()
	})

	it('shows the request error state', async () => {
		mocks.get
			.mockResolvedValueOnce({ data: { data: [article] } })
			.mockRejectedValueOnce(new Error('Docs API unavailable'))
		const { app, element } = mount(DocsModule, { id: article.id })

		await vi.waitFor(() => expect(element.textContent).toContain('Docs API unavailable'))
		app.unmount()
	})

	it('navigates when a navigation article is selected', () => {
		const { app, element } = mount(DocsNavigation, { articles: [article] })

		const button = element.querySelector('button')
		expect(button?.getAttribute('data-path')).toBe(`/docs/${article.id}`)
		app.unmount()
	})

	it('renders an article body and metadata independently', () => {
		const { app, element } = mount(DocsArticle, { article })

		expect(element.querySelector('.markdown')?.textContent).toContain('# Getting started')
		app.unmount()
	})
})
