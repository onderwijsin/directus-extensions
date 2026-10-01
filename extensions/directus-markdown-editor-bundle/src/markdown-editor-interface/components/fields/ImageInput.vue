<script setup lang="ts">
import { computed } from 'vue'

import {
	directusAssetId,
	formatAssetValue,
	imagePreviewUrl,
	type AssetStorageMode,
} from '../../editor/media'
import ImageUploadField from './ImageUploadField.vue'

const props = defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
	storageMode: AssetStorageMode
	baseUrl?: string
}>()
const model = defineModel<string>({ required: true })
const previewSource = computed(() => imagePreviewUrl(model.value))

/**
 * Persist only the selected Directus asset in the configured format.
 * @param value Directus upload selection.
 * @returns Nothing.
 */
function select(value: unknown) {
	const id = directusAssetId(value)
	if (!id || props.disabled) return
	const stored = formatAssetValue(id, props.storageMode, props.baseUrl)
	if (stored) model.value = stored
}

/**
 * Clear the selected image unless the input is disabled.
 * @returns Nothing.
 */
function clear() {
	if (!props.disabled) model.value = ''
}
</script>

<template>
	<ImageUploadField
		:id="id"
		:described-by="describedBy"
		:invalid="invalid"
		:required="required"
		:preview-source="previewSource"
		:disabled="disabled"
		@select="select"
		@clear="clear"
	/>
</template>
