import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'

import { loadComponentMetadata } from '../component-meta/loader'

export type ComponentMetadataState = 'idle' | 'loading' | 'ready' | 'error'

export interface ComponentMetadataOptions {
	metadataUrl?: Ref<string | null | undefined>
	useMockMetadata?: Ref<boolean | undefined>
}

/**
 * Editor callback.
 * @param options Parameter value.
 * @returns Callback result.
 */
export function useComponentMetadata(options: ComponentMetadataOptions) {
	const components = shallowRef<ComponentMetadata[]>([])
	const state = shallowRef<ComponentMetadataState>('idle')
	const error = shallowRef<Error | null>(null)
	let controller: AbortController | undefined
	const load =
		/**
		 * Editor callback.
		 * @param url Parameter value.
		 * @param useMock Parameter value.
		 * @returns Callback result.
		 */
		async (url: string | null | undefined, useMock: boolean | undefined) => {
			controller?.abort()
			const requestController = new AbortController()
			controller = requestController
			state.value = 'loading'
			error.value = null
			try {
				components.value = await loadComponentMetadata(
					url ?? undefined,
					requestController.signal,
					useMock,
				)
				state.value = 'ready'
			} catch (cause) {
				if (requestController.signal.aborted || controller !== requestController) return
				components.value = []
				state.value = 'error'
				error.value =
					cause instanceof Error ? cause : new Error('Unable to load component metadata.')
			}
		}

	watch(
		[options.metadataUrl ?? shallowRef(undefined), options.useMockMetadata ?? shallowRef(true)],

		/**
		 * Editor callback.
		 * @param values Parameter value.
		 * @returns Callback result.
		 */
		(values) => {
			const [url, useMock] = values
			return load(url, useMock)
		},
		{ immediate: true },
	)
	onBeforeUnmount(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => controller?.abort(),
	)

	const hasComponents = computed(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => components.value.length > 0,
	)
	return { components, state, error, hasComponents }
}
