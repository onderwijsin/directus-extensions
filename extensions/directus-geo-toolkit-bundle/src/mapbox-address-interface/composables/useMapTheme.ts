import { computed, onScopeDispose, ref } from 'vue'

import { useStores } from '@directus/extensions-sdk'

/** Resolves appearance using the same precedence as Directus useThemeConfiguration.
 * @returns Whether the user, project default or automatic browser preference selects dark mode.
 */
export function useMapTheme() {
	const stores = useStores()
	const useUserStore: () => { currentUser: { appearance?: string | null } | null } =
		stores.useUserStore
	const useServerStore: () => {
		info: { project?: { default_appearance?: string | null } } | null
	} = stores.useServerStore
	const userStore = useUserStore()
	const serverStore = useServerStore()
	const media = window.matchMedia('(prefers-color-scheme: dark)')
	const browserDark = ref(media.matches)

	/** Tracks browser changes while the configured appearance is automatic.
	 * @returns Nothing after updating the browser preference.
	 */
	function updateBrowserAppearance() {
		browserDark.value = media.matches
	}
	media.addEventListener('change', updateBrowserAppearance)
	onScopeDispose(() => media.removeEventListener('change', updateBrowserAppearance))

	return computed(() => {
		const appearance =
			userStore.currentUser?.appearance ??
			serverStore.info?.project?.default_appearance ??
			'auto'
		return !appearance || appearance === 'auto' ? browserDark.value : appearance === 'dark'
	})
}
