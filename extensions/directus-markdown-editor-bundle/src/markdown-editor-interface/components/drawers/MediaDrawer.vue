<script setup lang="ts">
import type { Editor } from '@tiptap/core'

import { computed, ref, shallowRef, watch } from 'vue'

import { isString } from '@onderwijsin/directus-extension-utils'

import {
	directusAssetId,
	directusAssetUrl,
	imagePreviewUrl,
	normalizeAssetBaseUrl,
	sanitizeImageUrl,
	type AssetStorageMode,
} from '../../editor/media'
import Field from '../fields/Field.vue'
import ImageInput from '../fields/ImageInput.vue'
import StringInput from '../fields/StringInput.vue'
import VideoUploadField from '../fields/VideoUploadField.vue'

const props = defineProps<{
	editor: Editor
	disabled?: boolean
	initialType?: 'image' | 'video'
	assetStorageMode?: AssetStorageMode
	assetBaseUrl?: string
}>()
const open = defineModel<boolean>({ default: false })
const activeTab = ref('image')
const source = ref('')
const altText = ref('')
const editing = shallowRef(false)
const assetBaseError = computed(() =>
	activeTab.value === 'image' &&
	props.assetStorageMode === 'url' &&
	!normalizeAssetBaseUrl(props.assetBaseUrl ?? '')
		? 'Configure a valid HTTP(S) asset base URL.'
		: undefined,
)
const canApply = computed(
	() =>
		!assetBaseError.value &&
		Boolean(
			activeTab.value === 'image'
				? imagePreviewUrl(source.value)
				: sanitizeImageUrl(source.value),
		),
)
const drawerTitle = computed(() =>
	activeTab.value === 'image' ? 'Add/Edit Image' : 'Add/Edit Media',
)
const saveLabel = computed(() => (activeTab.value === 'image' ? 'Save Image' : 'Save Media'))

watch(
	open,
	/**
	 * Load the selected media node when the drawer opens.
	 * @param isOpen Whether the drawer is open.
	 * @returns Nothing.
	 */
	(isOpen) => {
		if (!isOpen) return
		activeTab.value = props.editor.isActive('video')
			? 'video'
			: props.editor.isActive('image')
				? 'image'
				: (props.initialType ?? 'image')
		const nodeType = activeTab.value
		editing.value = props.editor.isActive(nodeType)
		const attrs = editing.value ? props.editor.getAttributes(nodeType) : {}
		source.value = isString(attrs.src) ? attrs.src : ''
		altText.value = nodeType === 'image' && isString(attrs.alt) ? attrs.alt : ''
	},
)

/**
 * Store a selected Directus asset as the media source.
 * @param value The selected Directus file.
 * @returns Nothing.
 */
function onFileSelect(value: unknown) {
	if (props.disabled) return
	const id = directusAssetId(value)
	if (!id) return
	const url = directusAssetUrl(id)
	if (url) source.value = url
}

/**
 * Clear the currently selected media source from the drawer draft.
 * @returns Nothing.
 */
function clearSource() {
	if (!props.disabled) source.value = ''
}

/**
 * Insert or update the selected media node.
 * @returns Nothing.
 */
function save() {
	if (!canApply.value || props.disabled) return
	const src =
		activeTab.value === 'image'
			? imagePreviewUrl(source.value) && source.value.trim()
			: sanitizeImageUrl(source.value)
	if (!src) return
	const nodeType = activeTab.value === 'video' ? 'video' : 'image'
	const chain = props.editor.chain().focus()
	if (editing.value && props.editor.isActive(nodeType))
		chain.updateAttributes(
			nodeType,
			nodeType === 'image' ? { src, alt: altText.value } : { src },
		)
	else
		chain.insertContent({
			type: nodeType,
			attrs: nodeType === 'image' ? { src, alt: altText.value, title: null } : { src },
		})
	chain.run()
	open.value = false
}

/**
 * Delete the currently selected media node.
 * @returns Nothing.
 */
function remove() {
	if (!editing.value || props.disabled || !props.editor.isActive(activeTab.value)) return
	props.editor.chain().focus().deleteSelection().run()
	open.value = false
}
</script>

<template>
	<VDrawer
		:model-value="open"
		:title="drawerTitle"
		icon="slideshow"
		@update:model-value="open = $event"
		@cancel="open = false"
		@apply="save"
	>
		<div class="media-drawer__content">
			<Field
				v-if="activeTab === 'image'"
				label="Image"
				:error="assetBaseError"
				:disabled="disabled"
			>
				<template #default="field">
					<ImageInput
						v-model="source"
						v-bind="field"
						:storage-mode="assetStorageMode ?? 'path'"
						:base-url="assetBaseUrl"
					/>
				</template>
			</Field>
			<Field v-if="activeTab === 'image'" label="Alt text" :disabled="disabled">
				<template #default="field">
					<StringInput
						v-model="altText"
						v-bind="field"
						placeholder="Describe the image"
					/>
				</template>
			</Field>
			<VideoUploadField
				v-else
				:preview-source="sanitizeImageUrl(source)"
				:disabled="disabled"
				@select="onFileSelect"
				@clear="clearSource"
			/>
		</div>
		<template #actions>
			<VButton v-if="editing" secondary small :disabled="disabled" @click="remove"
				>Delete</VButton
			>
		</template>
		<template #actions:primary>
			<VButton :disabled="disabled || !canApply" small @click="save">{{ saveLabel }}</VButton>
		</template>
	</VDrawer>
</template>

<style scoped>
.media-drawer__content {
	display: grid;
	gap: 1rem;
	min-width: 0;
	min-height: 14rem;
	padding: var(--content-padding, 1.125rem);
}
</style>
