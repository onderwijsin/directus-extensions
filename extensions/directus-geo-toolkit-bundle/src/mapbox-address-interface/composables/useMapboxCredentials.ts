import type { InterfaceOptions } from '../utils/types'

import { computed, toValue, type MaybeRefOrGetter } from 'vue'

import { isNonBlankString } from '@onderwijsin/directus-extension-utils'

/** Uses the interface key first, then the native Studio settings key.
 * @param options - Reactive validated interface options.
 * @param settingsKey - Reactive native Studio settings value.
 * @returns Public token and safe configuration feedback.
 */
export function useMapboxCredentials(
	options: MaybeRefOrGetter<InterfaceOptions | null>,
	settingsKey: MaybeRefOrGetter<unknown>,
) {
	const token = computed(() => {
		const config = toValue(options)
		if (!config) return ''
		const global = toValue(settingsKey)
		const native = isNonBlankString(global) ? global.trim() : ''
		const override = config.mapboxKey?.length === 0 ? undefined : config.mapboxKey
		return override ?? native
	})
	const error = computed(() =>
		!token.value
			? 'Set a public Mapbox key in the interface options or Directus project settings.'
			: !token.value.startsWith('pk.')
				? 'A browser-public Mapbox token beginning with pk. is required.'
				: '',
	)
	return { token, error }
}
