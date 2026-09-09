// @vitest-environment happy-dom

import type { App, Ref } from 'vue'

import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import { ofetch } from 'ofetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
	type ComponentMetadataOptions,
	useComponentMetadata,
} from '../src/markdown-editor-interface/composables/useComponentMetadata'

vi.mock('ofetch', () => ({ ofetch: vi.fn() }))

const mountedApps: App[] = []
const fetchMetadata = vi.mocked(ofetch)

function mountMetadata(options: ComponentMetadataOptions) {
	let result: ReturnType<typeof useComponentMetadata> | undefined
	const app = createApp(
		defineComponent({
			setup() {
				result = useComponentMetadata(options)
				return () => h('div')
			},
		}),
	)
	app.mount(document.createElement('div'))
	mountedApps.push(app)
	if (!result) throw new Error('Component metadata composable did not initialize.')
	return result
}

async function flushMetadata() {
	await nextTick()
	await Promise.resolve()
	await nextTick()
}

function deferred<T>() {
	let resolvePromise: ((value: T) => void) | undefined
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve
	})
	return {
		promise,
		resolve(value: T) {
			if (!resolvePromise) throw new Error('Deferred promise did not initialize.')
			resolvePromise(value)
		},
	}
}

beforeEach(() => {
	fetchMetadata.mockReset()
})

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount()
})

describe('component metadata sources', () => {
	it.each([
		{
			label: 'array payload',
			payload: [{ name: 'Hero', nodeType: 'block', slots: ['title'] }],
		},
		{
			label: 'components object payload',
			payload: { components: [{ name: 'Callout', label: 'Callout', nodeType: 'inline' }] },
		},
	])('normalizes valid static metadata from a $label', async ({ payload }) => {
		const metadata = mountMetadata({
			useStaticComponentMeta: shallowRef(true),
			staticComponentMeta: shallowRef(payload),
		})

		await flushMetadata()

		expect(metadata.state.value).toBe('ready')
		expect(metadata.components.value).toMatchObject(
			payload instanceof Array ? payload : payload.components,
		)
		expect(fetchMetadata).not.toHaveBeenCalled()
	})

	it('reports invalid static metadata through the shared error state', async () => {
		const metadata = mountMetadata({
			useStaticComponentMeta: shallowRef(true),
			staticComponentMeta: shallowRef({ components: [{ label: 'Missing name' }] }),
		})

		await flushMetadata()

		expect(metadata.components.value).toEqual([])
		expect(metadata.state.value).toBe('error')
		expect(metadata.error.value?.message).toContain('unsupported shape')
		expect(fetchMetadata).not.toHaveBeenCalled()
	})

	it('loads and normalizes remote metadata when static mode is disabled', async () => {
		fetchMetadata.mockResolvedValue({ components: [{ name: 'Remote', nodeType: 'inline' }] })
		const metadata = mountMetadata({
			metadataUrl: shallowRef('https://example.com/components.json'),
			useStaticComponentMeta: shallowRef(false),
		})

		await flushMetadata()

		expect(fetchMetadata).toHaveBeenCalledOnce()
		expect(metadata.state.value).toBe('ready')
		expect(metadata.components.value).toMatchObject([{ name: 'Remote', nodeType: 'inline' }])
	})

	it('switches from URL metadata to static metadata without another request', async () => {
		fetchMetadata.mockResolvedValue([{ name: 'Remote', nodeType: 'inline' }])
		const useStaticComponentMeta = shallowRef(false)
		const staticComponentMeta = shallowRef<unknown>([{ name: 'Static', nodeType: 'block' }])
		const metadata = mountMetadata({
			metadataUrl: shallowRef('https://example.com/components.json'),
			useStaticComponentMeta,
			staticComponentMeta,
		})
		await flushMetadata()

		useStaticComponentMeta.value = true
		await flushMetadata()

		expect(fetchMetadata).toHaveBeenCalledOnce()
		expect(metadata.components.value).toMatchObject([{ name: 'Static', nodeType: 'block' }])
	})

	it('switches from static metadata to URL metadata', async () => {
		fetchMetadata.mockResolvedValue([{ name: 'Remote', nodeType: 'inline' }])
		const useStaticComponentMeta = shallowRef(true)
		const metadataUrl = shallowRef('https://example.com/components.json')
		const metadata = mountMetadata({
			metadataUrl,
			useStaticComponentMeta,
			staticComponentMeta: shallowRef([{ name: 'Static', nodeType: 'block' }]),
		})
		await flushMetadata()

		useStaticComponentMeta.value = false
		await flushMetadata()

		expect(fetchMetadata).toHaveBeenCalledOnce()
		expect(metadata.components.value).toMatchObject([{ name: 'Remote' }])
	})

	it('aborts and ignores a stale URL request after configuration changes', async () => {
		const firstRequest = deferred<unknown>()
		fetchMetadata
			.mockImplementationOnce(() => firstRequest.promise)
			.mockResolvedValueOnce([{ name: 'Current', nodeType: 'block' }])
		const metadataUrl: Ref<string | undefined> = shallowRef('https://example.com/first.json')
		const metadata = mountMetadata({
			metadataUrl,
			useStaticComponentMeta: shallowRef(false),
		})
		await nextTick()
		const firstSignal = fetchMetadata.mock.calls[0]?.[1]?.signal

		metadataUrl.value = 'https://example.com/current.json'
		await flushMetadata()

		expect(firstSignal?.aborted).toBe(true)
		expect(metadata.components.value).toMatchObject([{ name: 'Current', nodeType: 'block' }])

		firstRequest.resolve([{ name: 'Stale', nodeType: 'inline' }])
		await flushMetadata()
		expect(metadata.components.value).toMatchObject([{ name: 'Current', nodeType: 'block' }])
	})
})
