import type { AddressValue, InterfaceOptions } from '../utils/types'

import { ref, toValue, watch, onScopeDispose, type MaybeRefOrGetter } from 'vue'

import mapboxgl from 'mapbox-gl'

import { useMapTheme } from './useMapTheme'

/** Owns per-instance maps/markers without proxying Mapbox objects or changing global tokens.
 * @param container - Mounted map container.
 * @param options - Validated display options.
 * @param token - Resolved public token.
 * @param value - Current validated selection.
 * @param enabled - Whether a map can currently be displayed.
 * @returns Safe map feedback.
 */
export function useMapboxMap(
	container: MaybeRefOrGetter<HTMLElement | null>,
	options: MaybeRefOrGetter<InterfaceOptions | null>,
	token: MaybeRefOrGetter<string>,
	value: MaybeRefOrGetter<AddressValue | null>,
	enabled: MaybeRefOrGetter<boolean>,
) {
	const error = ref('')
	const dark = useMapTheme()
	let map: mapboxgl.Map | undefined
	let marker: mapboxgl.Marker | undefined
	let observer: ResizeObserver | undefined

	/** Removes workers, observers, event handlers and marker state.
	 * @returns Nothing after updating local interface state.
	 */
	function remove() {
		observer?.disconnect()
		observer = undefined
		marker?.remove()
		marker = undefined
		map?.remove()
		map = undefined
	}

	/** Updates selection presentation without emitting a field mutation.
	 * @returns Nothing after updating the local interface state.
	 */
	function updateSelection() {
		const current = toValue(value)
		const config = toValue(options)
		if (!map || !config) return
		if (!current) {
			marker?.remove()
			marker = undefined
			map.jumpTo({ center: config.defaultCenter, zoom: config.defaultZoom })
			return
		}
		if (!marker)
			marker = new mapboxgl.Marker({ draggable: false })
				.setLngLat(current.geometry.coordinates)
				.addTo(map)
		else marker.setLngLat(current.geometry.coordinates)
		map.jumpTo({ center: current.geometry.coordinates, zoom: config.selectedZoom })
	}

	// Directus can supply equivalent option objects during unrelated item edits.
	watch(
		[
			() => toValue(container),
			() => toValue(token),
			() => toValue(enabled),
			() => toValue(options)?.defaultCenter[0],
			() => toValue(options)?.defaultCenter[1],
			() => toValue(options)?.defaultZoom,
		],
		() => {
			remove()
			error.value = ''
			const element = toValue(container)
			const config = toValue(options)
			if (!element || !config || !toValue(enabled)) return
			if (!mapboxgl.supported()) {
				error.value =
					'The map requires WebGL support. The selected address and coordinates are still available.'
				return
			}
			try {
				map = new mapboxgl.Map({
					container: element,
					accessToken: toValue(token),
					style:
						config.styleUrl ??
						(dark.value ? config.darkStyleUrl : config.lightStyleUrl),
					center: config.defaultCenter,
					zoom: config.defaultZoom,
					attributionControl: true,
				})
				map.on('error', () => {
					error.value =
						'The map could not load. Check the token, style and Content Security Policy.'
				})
				map.on('load', () => {
					map?.resize()
					updateSelection()
				})
				if (typeof ResizeObserver !== 'undefined') {
					observer = new ResizeObserver(() => map?.resize())
					observer.observe(element)
				}
				updateSelection()
			} catch {
				remove()
				error.value = 'The map could not initialize. The address remains available as text.'
			}
		},
		{ flush: 'post', immediate: true },
	)
	watch(
		[
			() => toValue(value)?.geometry.coordinates[0],
			() => toValue(value)?.geometry.coordinates[1],
			() => toValue(options)?.selectedZoom,
		],
		updateSelection,
	)
	watch(
		() => {
			const config = toValue(options)
			return config?.styleUrl ?? (dark.value ? config?.darkStyleUrl : config?.lightStyleUrl)
		},
		(style) => {
			if (style) map?.setStyle(style)
		},
	)
	onScopeDispose(remove)
	return { error }
}
