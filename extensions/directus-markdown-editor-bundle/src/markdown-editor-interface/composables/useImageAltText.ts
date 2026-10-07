import type { Ref } from 'vue'

import { onBeforeUnmount, shallowRef, watch } from 'vue'

import { useApi } from '@directus/extensions-sdk'
import { z } from 'zod'

import { directusAssetId } from '../editor/media'

/**
 * Manage optional file-description defaults for untouched new image drafts.
 * @param open Whether the media drawer is open.
 * @param editing Whether the draft edits an existing Markdown node.
 * @param disabled Whether author interactions are disabled.
 * @returns Alt text, waiting status, and draft lifecycle handlers.
 */
export function useImageAltText(
	open: Ref<boolean>,
	editing: Ref<boolean>,
	disabled: () => boolean,
) {
	const altText = shallowRef('')
	const api = useApi()
	const altTextTouched = shallowRef(false)
	const waitingForAltText = shallowRef(false)
	const selectedFileId = shallowRef<string>()
	const fileDescriptionSchema = z.object({ description: z.string().trim().nullish() })
	const fileResponseSchema = z.object({
		data: z.object({
			data: z.object({ id: z.string(), description: z.string().trim().nullish() }),
		}),
	})
	const retryDelays = [500, 1000, 2000, 4000, 8000]
	let metadataController: AbortController | undefined
	let metadataTimer: ReturnType<typeof setTimeout> | undefined

	/**
	 * Invalidate metadata work and hide its non-blocking status.
	 * @returns Nothing.
	 */
	function stopMetadata() {
		metadataController?.abort()
		metadataController = undefined
		clearTimeout(metadataTimer)
		metadataTimer = undefined
		waitingForAltText.value = false
	}

	onBeforeUnmount(stopMetadata)

	/**
	 * Preserve every manual edit, including clearing an automatic description.
	 * @param value Author-entered alt text.
	 * @returns Nothing.
	 */
	function onAltTextInput(value: string) {
		onAltTextEdit()
		altText.value = value
		stopMetadata()
	}

	/**
	 * Mark native input even when its value stays empty.
	 * @returns Nothing.
	 */
	function onAltTextEdit() {
		altTextTouched.value = true
		stopMetadata()
	}

	/**
	 * Prefill only untouched new image drafts from the selected file or bounded API retries.
	 * @param value Full Directus file selection.
	 * @returns Nothing.
	 */
	function selectImage(value: unknown) {
		stopMetadata()
		selectedFileId.value = directusAssetId(value) ?? undefined
		const id = selectedFileId.value
		if (!open.value || disabled() || editing.value || altTextTouched.value || !id) return
		altText.value = ''
		const initial = fileDescriptionSchema.safeParse(Array.isArray(value) ? value[0] : value)
		if (initial.success && initial.data.description) {
			altText.value = initial.data.description
			return
		}
		const metadataUrl = `/files/${encodeURIComponent(id)}?fields=id,description`
		const controller = new AbortController()
		metadataController = controller
		waitingForAltText.value = true

		/**
		 * Check that this request still belongs to the current untouched draft.
		 * @returns Whether metadata may still update the draft.
		 */
		function current() {
			return (
				!controller.signal.aborted &&
				open.value &&
				!editing.value &&
				!altTextTouched.value &&
				selectedFileId.value === id
			)
		}

		/**
		 * Schedule the next bounded lookup; failures are optional enhancement failures.
		 * @param attempt Retry index.
		 * @returns Nothing.
		 */
		function schedule(attempt: number) {
			const delay = retryDelays[attempt]
			if (delay === undefined) {
				stopMetadata()
				return
			}
			metadataTimer = setTimeout(() => {
				void lookup()
			}, delay)
			/**
			 * Read one projected file record and continue only for the current draft.
			 * @returns Resolves after this lookup is handled.
			 */
			async function lookup() {
				if (!current()) return
				try {
					const response: unknown = await api.get(metadataUrl, {
						signal: controller.signal,
					})
					if (!current()) return
					const result = fileResponseSchema.safeParse(response)
					if (
						result.success &&
						result.data.data.data.id === id &&
						result.data.data.data.description
					) {
						altText.value = result.data.data.data.description
						stopMetadata()
						return
					}
				} catch {
					// Metadata is optional; retry silently while this draft remains current.
				}
				if (current()) schedule(attempt + 1)
			}
		}
		schedule(0)
	}

	/**
	 * Clear metadata associated with a deselected image.
	 * @returns Nothing.
	 */
	function clearImage() {
		stopMetadata()
		selectedFileId.value = undefined
		if (!editing.value && !altTextTouched.value) altText.value = ''
	}

	/**
	 * Reset author interaction for a newly opened draft.
	 * @returns Nothing.
	 */
	function reset() {
		stopMetadata()
		selectedFileId.value = undefined
		altTextTouched.value = false
	}
	watch(open, () => stopMetadata(), { flush: 'sync' })
	return {
		altText,
		waitingForAltText,
		selectImage,
		clearImage,
		reset,
		onAltTextInput,
		onAltTextEdit,
	}
}
