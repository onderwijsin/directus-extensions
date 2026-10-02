<script setup lang="ts">
/* eslint-disable jsdoc-js/require-jsdoc -- Computed accessors are private Vue bindings. */
import { computed, shallowRef, watch } from 'vue'

import { attempt } from '@onderwijsin/directus-extension-utils'

import { useIconifyApi } from '../shared/useIconifyApi'

interface OptionsValue {
	collections?: string[]
	useProxy?: boolean
}

const props = defineProps<{ value?: OptionsValue | null; disabled?: boolean }>()
const emit = defineEmits<{ input: [value: OptionsValue] }>()
const iconifyApi = useIconifyApi()
const items = shallowRef<{ text: string; value: string }[]>([])
const error = shallowRef(false)

const selected = computed({
	get: () => props.value?.collections ?? [],
	set: (collections: string[]) => emit('input', { ...props.value, collections }),
})

const useProxy = computed({
	get: () => props.value?.useProxy !== false,
	set: (value: boolean) => emit('input', { ...props.value, useProxy: value }),
})

watch(
	useProxy,
	async (proxy, _old, onCleanup) => {
		let cancelled = false
		onCleanup(() => {
			cancelled = true
		})
		const { data: response } = await attempt(() => iconifyApi.getCollections(proxy))
		if (cancelled) return
		if (response !== null) {
			items.value = Object.entries(response).map(([value, info]) => ({
				value,
				text: info.name ?? value,
			}))
			error.value = false
		} else {
			error.value = true
		}
	},
	{ immediate: true },
)
</script>

<template>
	<div class="iconify-options">
		<p class="type-label">Icon collections</p>
		<VSelect
			v-model="selected"
			:items="items"
			:disabled="disabled"
			multiple
			show-deselect
			placeholder="All collections"
		/>
		<VNotice v-if="error" type="warning">Unable to load Iconify collections.</VNotice>
		<p class="note">Leave empty to include every collection.</p>
		<p class="type-label">Iconify API</p>
		<VCheckbox
			v-model="useProxy"
			:disabled="disabled"
			label="Use proxy for Iconify API"
			block
		/>
	</div>
</template>

<style scoped>
.iconify-options {
	width: 100%;
}
.type-label {
	margin-top: 16px;
	margin-bottom: 8px;
}
.note {
	color: var(--theme--foreground-subdued);
	margin-top: 8px;
}
</style>
