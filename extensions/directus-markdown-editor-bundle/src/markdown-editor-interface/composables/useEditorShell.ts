import type { Ref } from 'vue'

import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'

/**
 * Coordinate browser-shell behavior owned by one Markdown editor instance.
 * @param disabled Whether Directus currently exposes the field as read-only.
 * @returns Reactive theme and fullscreen state with a guarded toggle action.
 */
export function useEditorShell(disabled: Readonly<Ref<boolean | undefined>>) {
	const darkMode = shallowRef(false)
	const fullscreen = shallowRef(false)
	let themeObserver: MutationObserver | undefined

	/** @returns Nothing after mirroring the Directus shell theme. */
	function updateDarkMode() {
		darkMode.value =
			document.body.classList.contains('dark') ||
			document.documentElement.classList.contains('dark') ||
			document.body.dataset.theme === 'dark' ||
			document.documentElement.dataset.theme === 'dark'
	}

	/**
	 * Exit fullscreen when Escape is pressed anywhere in the viewport.
	 * @param event Keyboard event from the viewport.
	 * @returns Nothing.
	 */
	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && fullscreen.value) fullscreen.value = false
	}

	/** @returns Nothing after toggling viewport-filling mode when editable. */
	function toggleFullscreen() {
		if (disabled.value) return
		fullscreen.value = !fullscreen.value
	}

	onMounted(() => {
		updateDarkMode()
		themeObserver = new MutationObserver(updateDarkMode)
		themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ['class', 'data-theme'],
		})
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme'],
		})
		window.addEventListener('keydown', handleEscape)
	})

	onBeforeUnmount(() => {
		themeObserver?.disconnect()
		window.removeEventListener('keydown', handleEscape)
	})

	watch(disabled, (value) => {
		if (value) fullscreen.value = false
	})

	return { darkMode, fullscreen, toggleFullscreen }
}
