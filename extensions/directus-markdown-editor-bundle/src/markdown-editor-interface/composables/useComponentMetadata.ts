import type { ComponentMetadataSource } from '../component-meta/loader'
import type { ComponentMetadata } from '../component-meta/schema'

import { computed, onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'

import { loadComponentMetadata } from '../component-meta/loader'

export type ComponentMetadataState = 'idle' | 'loading' | 'ready' | 'error'

export interface ComponentMetadataOptions {
	metadataUrl?: Ref<string | null | undefined>
	useStaticComponentMeta?: Ref<boolean | undefined>
	staticComponentMeta?: Ref<unknown>
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
	let loadVersion = 0
	const load =
		/**
		 * Editor callback.
		 * @param url Parameter value.
		 * @param useStatic Parameter value.
		 * @param staticValue Parameter value.
		 * @returns Callback result.
		 */
		async (
			url: string | null | undefined,
			useStatic: boolean | undefined,
			staticValue: unknown,
		) => {
			controller?.abort()
			const version = ++loadVersion
			const requestController = useStatic ? undefined : new AbortController()
			controller = requestController
			state.value = 'loading'
			error.value = null
			try {
				const source: ComponentMetadataSource = useStatic
					? { type: 'static', value: staticValue }
					: { type: 'url', url: url ?? undefined }
				const nextComponents = await loadComponentMetadata(
					source,
					requestController?.signal,
				)
				if (version !== loadVersion) return
				components.value = nextComponents
				state.value = 'ready'
			} catch (cause) {
				if (version !== loadVersion || requestController?.signal.aborted) return
				components.value = []
				state.value = 'error'
				error.value =
					cause instanceof Error ? cause : new Error('Unable to load component metadata.')
			}
		}

	watch(
		[
			options.metadataUrl ?? shallowRef(undefined),
			options.useStaticComponentMeta ?? shallowRef(false),
			options.staticComponentMeta ?? shallowRef(undefined),
		],

		/**
		 * Editor callback.
		 * @param values Parameter value.
		 * @returns Callback result.
		 */
		(values) => {
			const [url, useStatic, staticValue] = values
			return load(url, useStatic, staticValue)
		},
		{ immediate: true },
	)
	onBeforeUnmount(
		/**
		 * Editor callback.
		 * @returns Callback result.
		 */
		() => {
			loadVersion++
			controller?.abort()
		},
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
