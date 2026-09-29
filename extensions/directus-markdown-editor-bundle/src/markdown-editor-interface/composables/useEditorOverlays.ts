import type { Editor } from '@tiptap/core'
import type { Ref } from 'vue'

import { shallowRef, watch } from 'vue'

interface EditorOverlayOptions {
	disabled: Readonly<Ref<boolean | undefined>>
	getEditor: () => Editor | null | undefined
	componentInsertionEnabled: Readonly<Ref<boolean>>
	dismissSuggestions: () => void
}

/**
 * Own drawer and report state for the Markdown editor composition surface.
 * @param options Reactive editor capabilities and editor accessors.
 * @returns Overlay state and guarded actions used by toolbar and contextual controls.
 */
export function useEditorOverlays(options: EditorOverlayOptions) {
	const linkDrawerOpen = shallowRef(false)
	const mediaDrawerOpen = shallowRef(false)
	const mediaDrawerType = shallowRef<'image' | 'video'>('image')
	const sourceDrawerOpen = shallowRef(false)
	const componentInsertOpen = shallowRef(false)
	const componentPropsReportOpen = shallowRef(false)
	const referenceReportOpen = shallowRef(false)

	/** @returns Whether editor-owned controls may open or mutate content. */
	function canInteract() {
		return !options.disabled.value && options.getEditor()?.isEditable === true
	}

	/**
	 * Open the shared media drawer in the requested mode.
	 * @param type Media type to insert or edit.
	 * @returns Nothing.
	 */
	function openMediaDrawer(type: 'image' | 'video') {
		if (!canInteract()) return
		options.dismissSuggestions()
		mediaDrawerType.value = type
		mediaDrawerOpen.value = true
	}

	/** @returns Nothing after opening link editing when allowed. */
	function openLinkDrawer() {
		if (!canInteract()) return
		options.dismissSuggestions()
		linkDrawerOpen.value = true
	}

	/** @returns Nothing after opening direct Markdown source editing when allowed. */
	function openSourceDrawer() {
		if (!canInteract()) return
		options.dismissSuggestions()
		sourceDrawerOpen.value = true
	}

	/** @returns Nothing after opening component insertion when allowed. */
	function openComponentInsert() {
		if (!canInteract() || !options.componentInsertionEnabled.value) return
		options.dismissSuggestions()
		componentInsertOpen.value = true
	}

	watch(options.disabled, (value) => {
		if (!value) return
		linkDrawerOpen.value = false
		mediaDrawerOpen.value = false
		sourceDrawerOpen.value = false
		componentInsertOpen.value = false
	})

	return {
		canInteract,
		componentInsertOpen,
		componentPropsReportOpen,
		linkDrawerOpen,
		mediaDrawerOpen,
		mediaDrawerType,
		openComponentInsert,
		openLinkDrawer,
		openMediaDrawer,
		openSourceDrawer,
		referenceReportOpen,
		sourceDrawerOpen,
	}
}
