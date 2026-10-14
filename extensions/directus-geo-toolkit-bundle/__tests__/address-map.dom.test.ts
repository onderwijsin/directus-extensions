import { createApp, effectScope, h, nextTick, reactive, ref } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMapboxMap } from '../src/mapbox-address-interface/composables/useMapboxMap'
import { normalizeFeature } from '../src/mapbox-address-interface/utils/normalize'
import { interfaceOptionsSchema } from '../src/mapbox-address-interface/utils/options.schema'
import { mapboxFeatureSchema } from '../src/mapbox-address-interface/utils/response.schema'
import { feature } from './fixtures/address'

const mock = vi.hoisted(() => {
	const remove = vi.fn(),
		resize = vi.fn(),
		setStyle = vi.fn(),
		jumpTo = vi.fn(),
		markerRemove = vi.fn(),
		markerPosition = vi.fn(),
		addTo = vi.fn(),
		construct = vi.fn(),
		supported = vi.fn(() => true)
	const handlers: Record<string, () => void> = {}
	class Map {
		public constructor(options: unknown) {
			construct(options)
		}
		public on(event: string, callback: () => void) {
			handlers[event] = callback
			return this
		}
		public remove = remove
		public resize = resize
		public setStyle = setStyle
		public jumpTo = jumpTo
	}
	class Marker {
		public setLngLat(coordinates: unknown) {
			markerPosition(coordinates)
			return this
		}
		public addTo(map: unknown) {
			addTo(map)
			return this
		}
		public remove = markerRemove
	}
	return {
		Map,
		Marker,
		construct,
		supported,
		remove,
		resize,
		setStyle,
		jumpTo,
		markerRemove,
		markerPosition,
		addTo,
		handlers,
	}
})
const userStore = reactive<{ currentUser: { appearance?: string | null } | null }>({
	currentUser: null,
})
const serverStore = reactive<{ info: { project: { default_appearance: string | null } } | null }>({
	info: null,
})
vi.mock('@directus/extensions-sdk', () => ({
	useStores: () => ({ useUserStore: () => userStore, useServerStore: () => serverStore }),
}))
beforeEach(() => {
	userStore.currentUser = { appearance: 'light' }
	serverStore.info = null
})
vi.mock('mapbox-gl', () => ({
	default: { Map: mock.Map, Marker: mock.Marker, supported: mock.supported },
}))
afterEach(() => {
	vi.clearAllMocks()
	mock.supported.mockReturnValue(true)
})

describe('map lifecycle', () => {
	it('uses a per-map token, reacts to selection/configuration and disposes resources', async () => {
		const scope = effectScope()
		const options = ref(interfaceOptionsSchema.parse({}))
		const token = ref('pk.synthetic')
		const value = ref(normalizeFeature(mapboxFeatureSchema.parse(feature), options.value))
		scope.run(() => useMapboxMap(document.createElement('div'), options, token, value, true))
		await nextTick()
		expect(mock.construct).toHaveBeenCalledWith(
			expect.objectContaining({ accessToken: 'pk.synthetic', attributionControl: true }),
		)
		expect(mock.markerPosition).toHaveBeenCalledWith([4.9, 52.3])
		mock.handlers.load?.()
		expect(mock.resize).toHaveBeenCalled()
		token.value = 'pk.changed'
		await nextTick()
		expect(mock.remove).toHaveBeenCalledTimes(1)
		expect(mock.construct).toHaveBeenLastCalledWith(
			expect.objectContaining({ accessToken: 'pk.changed' }),
		)
		mock.handlers.error?.()
		scope.stop()
		expect(mock.remove).toHaveBeenCalledTimes(2)
		expect(mock.markerRemove).toHaveBeenCalled()
	})
	it('keeps the map and viewport stable when editor updates supply equivalent values', async () => {
		const scope = effectScope()
		const options = ref(interfaceOptionsSchema.parse({}))
		const value = ref(normalizeFeature(mapboxFeatureSchema.parse(feature), options.value))
		try {
			scope.run(() =>
				useMapboxMap(document.createElement('div'), options, 'pk.synthetic', value, true),
			)
			await nextTick()
			mock.jumpTo.mockClear()
			mock.markerPosition.mockClear()

			// Item form updates can supply fresh objects without changing this field's map inputs.
			for (let keystroke = 0; keystroke < 3; keystroke++) {
				options.value = interfaceOptionsSchema.parse(options.value)
				value.value = normalizeFeature(mapboxFeatureSchema.parse(feature), options.value)
				await nextTick()
			}
			expect(mock.construct).toHaveBeenCalledTimes(1)
			expect(mock.remove).not.toHaveBeenCalled()
			expect(mock.jumpTo).not.toHaveBeenCalled()
			expect(mock.markerPosition).not.toHaveBeenCalled()

			value.value.geometry.coordinates = [5, 52]
			await nextTick()
			expect(mock.markerPosition).toHaveBeenLastCalledWith([5, 52])
			expect(mock.jumpTo).toHaveBeenLastCalledWith({ center: [5, 52], zoom: 15 })
			options.value.selectedZoom = 12
			await nextTick()
			expect(mock.jumpTo).toHaveBeenLastCalledWith({ center: [5, 52], zoom: 12 })
			expect(mock.construct).toHaveBeenCalledTimes(1)
		} finally {
			scope.stop()
		}
	})
	it('switches theme styles without recreating the map or resetting the selection', async () => {
		const options = ref(interfaceOptionsSchema.parse({}))
		const selection = normalizeFeature(mapboxFeatureSchema.parse(feature), options.value)
		serverStore.info = { project: { default_appearance: 'dark' } }
		const app = createApp({
			setup() {
				useMapboxMap(
					document.createElement('div'),
					options,
					'pk.synthetic',
					selection,
					true,
				)
				return () => h('div')
			},
		})
		const element = document.createElement('div')
		app.mount(element)
		try {
			await nextTick()
			expect(mock.construct).toHaveBeenLastCalledWith(
				expect.objectContaining({ style: 'mapbox://styles/mapbox/light-v11' }),
			)
			mock.jumpTo.mockClear()
			userStore.currentUser = { appearance: 'dark' }
			await nextTick()
			expect(mock.setStyle).toHaveBeenLastCalledWith('mapbox://styles/mapbox/dark-v11')
			expect(mock.construct).toHaveBeenCalledTimes(1)
			expect(mock.jumpTo).not.toHaveBeenCalled()
			expect(mock.markerRemove).not.toHaveBeenCalled()
			expect(mock.markerPosition).toHaveBeenCalledWith(selection.geometry.coordinates)
			options.value = interfaceOptionsSchema.parse({
				styleUrl: 'mapbox://styles/mapbox/streets-v12',
			})
			await nextTick()
			expect(mock.setStyle).toHaveBeenLastCalledWith('mapbox://styles/mapbox/streets-v12')
		} finally {
			app.unmount()
		}
	})

	it('resolves project defaults and live browser preferences for automatic appearance', async () => {
		const media = window.matchMedia('(prefers-color-scheme: dark)')
		const matches = vi.spyOn(media, 'matches', 'get').mockReturnValue(true)
		vi.spyOn(window, 'matchMedia').mockReturnValue(media)
		const removeListener = vi.spyOn(media, 'removeEventListener')
		const scope = effectScope()
		try {
			userStore.currentUser = null
			serverStore.info = { project: { default_appearance: 'dark' } }
			scope.run(() =>
				useMapboxMap(
					document.createElement('div'),
					interfaceOptionsSchema.parse({}),
					'pk.synthetic',
					null,
					true,
				),
			)
			await nextTick()
			expect(mock.construct).toHaveBeenLastCalledWith(
				expect.objectContaining({ style: 'mapbox://styles/mapbox/dark-v11' }),
			)
			serverStore.info.project.default_appearance = 'light'
			await nextTick()
			expect(mock.setStyle).toHaveBeenLastCalledWith('mapbox://styles/mapbox/light-v11')
			userStore.currentUser = { appearance: 'auto' }
			await nextTick()
			expect(mock.setStyle).toHaveBeenLastCalledWith('mapbox://styles/mapbox/dark-v11')
			matches.mockReturnValue(false)
			media.dispatchEvent(new Event('change'))
			await nextTick()
			expect(mock.setStyle).toHaveBeenLastCalledWith('mapbox://styles/mapbox/light-v11')
		} finally {
			scope.stop()
			expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function))
			vi.restoreAllMocks()
		}
	})

	it('removes the marker and restores the default viewport when the persisted value is cleared', async () => {
		const scope = effectScope()
		const options = interfaceOptionsSchema.parse({ defaultCenter: [1, 2], defaultZoom: 4 })
		const value = ref<ReturnType<typeof normalizeFeature> | null>(
			normalizeFeature(mapboxFeatureSchema.parse(feature), options),
		)
		try {
			scope.run(() =>
				useMapboxMap(document.createElement('div'), options, 'pk.synthetic', value, true),
			)
			await nextTick()
			expect(mock.jumpTo).toHaveBeenLastCalledWith({ center: [4.9, 52.3], zoom: 15 })
			value.value = null
			await nextTick()
			expect(mock.markerRemove).toHaveBeenCalledTimes(1)
			expect(mock.jumpTo).toHaveBeenLastCalledWith({ center: [1, 2], zoom: 4 })
			expect(mock.construct).toHaveBeenCalledTimes(1)
		} finally {
			scope.stop()
		}
	})

	it('reports unavailable WebGL without constructing a map', async () => {
		mock.supported.mockReturnValue(false)
		const scope = effectScope()
		const state = scope.run(() =>
			useMapboxMap(
				document.createElement('div'),
				interfaceOptionsSchema.parse({}),
				'pk.synthetic',
				null,
				true,
			),
		)
		await nextTick()
		expect(state?.error.value).toContain('WebGL')
		expect(mock.construct).not.toHaveBeenCalled()
		scope.stop()
	})
})
