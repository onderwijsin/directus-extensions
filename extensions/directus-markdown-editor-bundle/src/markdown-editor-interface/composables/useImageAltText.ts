import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'

import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'

import { useApi } from '@directus/extensions-sdk'
import { z } from 'zod'

import { directusAssetId } from '../editor/media'

const descriptionSchema = z.object({ description: z.string().trim().nullish() })
const responseSchema = z.object({
	data: z.object({
		data: z.object({ id: z.string(), description: z.string().trim().nullish() }),
	}),
})
const retryDelays = [500, 1000, 2000, 4000, 8000]

interface DescriptionRequest {
	id: string
	editor: Editor
	controller: AbortController
	timer?: ReturnType<typeof setTimeout>
	position?: number
	source?: string
	alt?: string
}

/**
 * Own image-description requests for the editor, including saved image occurrences.
 * @param getEditor Current editor instance.
 * @param disabled Whether author interactions are disabled.
 * @returns Draft controls and insertion tracking for the media drawer.
 */
export function useImageAltText(getEditor: () => Editor | undefined, disabled: () => boolean) {
	const api = useApi()
	const altText = shallowRef('')
	const altTextTouched = shallowRef(false)
	const editing = shallowRef(false)
	const draftActive = shallowRef(false)
	const draftRequest = shallowRef<DescriptionRequest>()
	const pendingCount = shallowRef(0)
	const requests = new Set<DescriptionRequest>()
	let editingPosition: number | undefined
	let disposed = false
	const waitingForAltText = computed(() => draftActive.value && Boolean(draftRequest.value))

	/**
	 * Remove one request and prevent its timer or in-flight response from updating content.
	 * @param request Request to finish or cancel.
	 * @returns Nothing.
	 */
	function finish(request: DescriptionRequest) {
		request.controller.abort()
		clearTimeout(request.timer)
		requests.delete(request)
		pendingCount.value = requests.size
		if (draftRequest.value === request) draftRequest.value = undefined
	}

	/**
	 * Discard an unsaved draft while allowing saved image requests to finish.
	 * @returns Nothing.
	 */
	function closeDraft() {
		const request = draftRequest.value
		if (request && request.position === undefined) finish(request)
		draftRequest.value = undefined
		draftActive.value = false
		editingPosition = undefined
	}

	/**
	 * Hydrate a drawer from authoritative Markdown or begin a new insertion draft.
	 * @param existing Whether an existing node is selected.
	 * @param alt Serialized alt text, or an empty new draft.
	 * @param position Selected node position when editing.
	 * @returns Nothing.
	 */
	function beginDraft(existing: boolean, alt: string, position?: number) {
		closeDraft()
		draftActive.value = true
		editing.value = existing
		editingPosition = existing ? position : undefined
		altText.value = alt
		altTextTouched.value = false
		if (existing)
			draftRequest.value = [...requests].find((request) => request.position === position)
	}

	/**
	 * Preserve manual interaction, including clearing an already-empty field.
	 * @returns Nothing.
	 */
	function onAltTextEdit() {
		altTextTouched.value = true
		if (draftRequest.value) finish(draftRequest.value)
	}

	/**
	 * Store an author's alt-text edit, normalizing Directus's nullable input.
	 * @param value Author-entered text or a cleared nullable input.
	 * @returns Nothing.
	 */
	function onAltTextInput(value: string | null) {
		onAltTextEdit()
		altText.value = value ?? ''
	}

	/**
	 * Cancel metadata when the selected image is deselected or replaced.
	 * @returns Nothing.
	 */
	function clearImage() {
		if (draftRequest.value) finish(draftRequest.value)
		if (!editing.value && !altTextTouched.value) altText.value = ''
	}

	/**
	 * Start bounded metadata lookup for the current untouched insertion draft.
	 * @param value Full Directus upload or library selection.
	 * @returns Nothing.
	 */
	function selectImage(value: unknown) {
		clearImage()
		const id = directusAssetId(value)
		const editor = getEditor()
		if (
			!draftActive.value ||
			disposed ||
			disabled() ||
			editing.value ||
			altTextTouched.value ||
			!id ||
			!editor
		)
			return
		const initial = descriptionSchema.safeParse(Array.isArray(value) ? value[0] : value)
		if (initial.success && initial.data.description) {
			altText.value = initial.data.description
			return
		}
		const request: DescriptionRequest = { id, editor, controller: new AbortController() }
		requests.add(request)
		pendingCount.value = requests.size
		draftRequest.value = request
		schedule(request, 0)
	}

	/**
	 * Schedule one retry relative to completion of the preceding lookup.
	 * @param request Current file-description request.
	 * @param attempt Retry index.
	 * @returns Nothing.
	 */
	function schedule(request: DescriptionRequest, attempt: number) {
		const delay = retryDelays[attempt]
		if (delay === undefined) {
			finish(request)
			return
		}
		request.timer = setTimeout(() => {
			void lookup(request, attempt)
		}, delay)
	}

	/**
	 * Fetch only description metadata and update either the draft or its saved occurrence.
	 * @param request Current file-description request.
	 * @param attempt Retry index.
	 * @returns Resolves when this lookup is handled.
	 */
	async function lookup(request: DescriptionRequest, attempt: number) {
		if (!requests.has(request)) return
		try {
			const response: unknown = await api.get(
				`/files/${encodeURIComponent(request.id)}?fields=id,description`,
				{
					signal: request.controller.signal,
				},
			)
			if (!requests.has(request) || disposed || request.editor.isDestroyed) return
			const result = responseSchema.safeParse(response)
			if (
				result.success &&
				result.data.data.data.id === request.id &&
				result.data.data.data.description
			) {
				const description = result.data.data.data.description
				if (draftRequest.value === request && !altTextTouched.value)
					altText.value = description
				finish(request)
				if (request.position !== undefined && !disabled() && request.editor.isEditable) {
					const node = request.editor.state.doc.nodeAt(request.position)
					if (
						node?.type.name === 'image' &&
						node.attrs.src === request.source &&
						node.attrs.alt === request.alt
					) {
						request.editor.view.dispatch(
							request.editor.state.tr
								.setNodeMarkup(request.position, undefined, {
									...node.attrs,
									alt: description,
								})
								.setMeta('addToHistory', false),
						)
					}
				}
				return
			}
		} catch {
			// Missing metadata and failed reads are optional enhancement failures.
		}
		if (requests.has(request)) schedule(request, attempt + 1)
	}

	/**
	 * Locate the inserted image in the transaction's changed ranges, without matching duplicates.
	 * @param transaction Image insertion transaction.
	 * @param source Persisted image source.
	 * @returns Position of the newly inserted image, if present.
	 */
	function insertionPosition(transaction: Transaction, source: string): number | undefined {
		let position: number | undefined
		transaction.mapping.maps.forEach((map, index) => {
			map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
				if (newEnd <= newStart) return
				const remaining = transaction.mapping.slice(index + 1)
				const from = remaining.map(newStart, -1)
				const to = remaining.map(newEnd, 1)
				transaction.doc.nodesBetween(from, to, (node, nodePosition) => {
					if (node.type.name === 'image' && node.attrs.src === source)
						position = nodePosition
				})
			})
		})
		return position
	}

	/**
	 * Transfer a pending draft lookup to the exact image occurrence after insertion succeeds.
	 * @param position Position captured from the insertion transaction.
	 * @param source Persisted image source.
	 * @returns Nothing.
	 */
	function commitInsertion(position: number | undefined, source: string) {
		const request = draftRequest.value
		if (!request) return
		if (position === undefined) {
			finish(request)
			return
		}
		request.position = position
		request.source = source
		request.alt = altText.value
	}

	/**
	 * Map pending image occurrences through edits and cancel deleted or manually changed targets.
	 * @param event Editor transaction event.
	 * @param event.transaction Current editor transaction.
	 * @returns Nothing.
	 */
	function onTransaction({ transaction }: { transaction: Transaction }) {
		if (!transaction.docChanged) return
		if (editingPosition !== undefined)
			editingPosition = transaction.mapping.map(editingPosition)
		for (const request of requests) {
			if (request.position === undefined) continue
			const mapped = transaction.mapping.mapResult(request.position)
			const node = transaction.doc.nodeAt(mapped.pos)
			if (
				mapped.deleted ||
				node?.type.name !== 'image' ||
				node.attrs.src !== request.source ||
				node.attrs.alt !== request.alt
			) {
				finish(request)
			} else request.position = mapped.pos
		}
	}

	/**
	 * Cancel all outstanding metadata when the owning editor is destroyed or replaced.
	 * @returns Nothing.
	 */
	function cancelAll() {
		for (const request of requests) finish(request)
	}

	watch(
		getEditor,
		(editor, _previous, onCleanup) => {
			if (!editor) return
			editor.on('transaction', onTransaction)
			editor.on('destroy', cancelAll)
			onCleanup(() => {
				editor.off('transaction', onTransaction)
				editor.off('destroy', cancelAll)
				cancelAll()
			})
		},
		{ immediate: true, flush: 'sync' },
	)
	onBeforeUnmount(() => {
		disposed = true
		cancelAll()
	})
	return {
		altText,
		waitingForAltText,
		pendingCount,
		beginDraft,
		closeDraft,
		selectImage,
		clearImage,
		onAltTextInput,
		onAltTextEdit,
		insertionPosition,
		commitInsertion,
	}
}

export type ImageAltTextController = ReturnType<typeof useImageAltText>
