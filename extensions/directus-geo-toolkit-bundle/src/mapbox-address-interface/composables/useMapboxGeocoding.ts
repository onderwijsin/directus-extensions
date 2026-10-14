import type { AddressValue, InterfaceOptions } from '../utils/types'

import { ref, shallowRef, toValue, watch, onScopeDispose, type MaybeRefOrGetter } from 'vue'

import { FetchError } from 'ofetch'

import { searchAddresses } from '../utils/geocoding'

/** Debounces address searches and ignores responses from older requests.
 * @param query - Reactive query text.
 * @param options - Validated search configuration.
 * @param token - Public token.
 * @param enabled - Whether editing and search are currently allowed.
 * @returns Transient results, attribution, safe feedback, and explicit invalidation.
 */
export function useMapboxGeocoding(
	query: MaybeRefOrGetter<string>,
	options: MaybeRefOrGetter<InterfaceOptions | null>,
	token: MaybeRefOrGetter<string>,
	enabled: MaybeRefOrGetter<boolean>,
) {
	const results = shallowRef<AddressValue[]>([])
	const attribution = ref('')
	const loading = ref(false)
	const error = ref('')
	const searched = ref(false)
	let timer: ReturnType<typeof setTimeout> | undefined
	let latestRequestId = 0

	/** Clears scheduled work and discards candidates; does not alter a saved value.
	 * @returns Nothing after updating local interface state.
	 */
	function invalidate() {
		latestRequestId++
		clearTimeout(timer)
		results.value = []
		attribution.value = ''
		loading.value = false
		error.value = ''
		searched.value = false
	}

	/** Searches for an address and updates the current results.
	 * @param text - Query captured at scheduling time.
	 * @param config - Validated interface options.
	 * @param key - Public token captured for this request.
	 * @param requestId - Request allowed to update the results.
	 * @returns Nothing after updating the local interface state.
	 */
	async function search(text: string, config: InterfaceOptions, key: string, requestId: number) {
		loading.value = true
		try {
			const response = await searchAddresses(text, config, key)
			if (requestId !== latestRequestId) return
			results.value = response.results
			attribution.value = response.attribution
			searched.value = true
		} catch (cause) {
			if (requestId !== latestRequestId) return
			if (cause instanceof FetchError && cause.statusCode === 429) {
				error.value = 'Mapbox rate limit reached. Try again later.'
			} else if (cause instanceof FetchError && [401, 403].includes(cause.statusCode ?? 0)) {
				error.value =
					'Mapbox denied the request. Check the public token, allowed origins, and account eligibility.'
			} else {
				error.value =
					'Address search failed. Check the connection and Mapbox configuration, then try again.'
			}
			results.value = []
		} finally {
			if (requestId === latestRequestId) loading.value = false
		}
	}

	watch(
		[
			() => toValue(query).trim(),
			() => toValue(options),
			() => toValue(token),
			() => toValue(enabled),
		],
		([text, config, key, active]) => {
			invalidate()
			if (!config || !active || !key || !text || text.length < config.minQueryLength) return
			if (text.length > 256 || text.includes(';') || text.split(/\s+/u).length > 20) {
				error.value =
					'Use an address query of at most 256 characters and 20 words, without semicolons.'
				return
			}
			const requestId = latestRequestId
			timer = setTimeout(() => {
				void search(text, config, key, requestId)
			}, config.debounceMs)
		},
		{ deep: true },
	)
	onScopeDispose(invalidate)
	return { results, attribution, loading, error, searched, invalidate }
}
