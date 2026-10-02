import { computed, shallowRef, watch, type Ref } from 'vue'

import { attempt } from '@onderwijsin/directus-extension-utils/app'

import { useIconifyApi } from '../shared/useIconifyApi'
interface IconGroup {
	name: string
	icons: string[]
}

/**
 * Loads icon names from selected Iconify collections when the picker opens.
 * @param active Whether the picker menu is open.
 * @param selected The selected collection prefixes.
 * @param useProxy Whether requests go through the Directus endpoint.
 * @returns Reactive groups and request state.
 */
export function useIconCollections(
	active: Ref<boolean>,
	selected: Ref<string[]>,
	useProxy: Ref<boolean>,
) {
	const iconifyApi = useIconifyApi()
	const groups = shallowRef<IconGroup[]>([])
	const loading = shallowRef(false)
	const error = shallowRef(false)

	watch([active, selected, useProxy], async ([isActive, prefixes, proxy], _old, onCleanup) => {
		if (!isActive) return
		let cancelled = false
		onCleanup(() => {
			cancelled = true
		})
		groups.value = []
		loading.value = true
		error.value = false
		let names = prefixes
		if (names.length === 0) {
			const { data: response } = await attempt(() => iconifyApi.getCollections(proxy))
			if (cancelled) return
			if (response === null) {
				error.value = true
				loading.value = false
				return
			}
			names = Object.keys(response)
		}
		for (let index = 0; index < names.length && !cancelled; index += 6) {
			const batch = names.slice(index, index + 6)
			const results = await Promise.all(
				batch.map((prefix) => attempt(() => iconifyApi.getCollection(prefix, proxy))),
			)
			if (cancelled) return
			const next = results.flatMap((result, offset) => {
				if (result.data === null) {
					error.value = true
					return []
				}
				const data = result.data
				const iconNames = [
					...(data.uncategorized ?? []),
					...Object.values(data.categories ?? {}).flat(),
					...Object.keys(data.aliases ?? {}),
				]
				return [
					{
						name: data.title ?? batch[offset] ?? '',
						icons: [...new Set(iconNames)].map((name) => `${batch[offset]}:${name}`),
					},
				]
			})
			groups.value = [...groups.value, ...next]
		}
		if (!cancelled) loading.value = false
	})

	return { groups: computed(() => groups.value), loading, error }
}
