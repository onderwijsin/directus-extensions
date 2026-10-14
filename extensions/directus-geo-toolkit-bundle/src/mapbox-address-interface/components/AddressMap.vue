<script setup lang="ts">
import type { AddressValue, InterfaceOptions } from '../utils/types'

import { useTemplateRef } from 'vue'

import { useMapboxMap } from '../composables/useMapboxMap'

const props = defineProps<{
	options: InterfaceOptions
	token: string
	value: AddressValue | null
}>()
const container = useTemplateRef<HTMLDivElement>('container')
const { error } = useMapboxMap(
	container,
	() => props.options,
	() => props.token,
	() => props.value,
	true,
)
</script>

<template>
	<div class="address-map">
		<div
			ref="container"
			class="map"
			:style="{ height: `${options.mapHeightPx}px` }"
			role="region"
			aria-label="Selected address map"
		/>
		<VNotice v-if="error" type="warning" role="status">{{ error }}</VNotice>
	</div>
</template>

<style scoped>
.map {
	width: 100%;
	border-radius: var(--theme--border-radius);
}
.address-map :deep(.v-notice) {
	margin-top: 0.5rem;
	color: var(--theme--foreground-subdued);
}
</style>

<style>
@import 'mapbox-gl/dist/mapbox-gl.css';
</style>
