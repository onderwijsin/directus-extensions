<script setup lang="ts">
import type { Editor } from '@tiptap/core'

import { computed, ref, shallowRef, watch } from 'vue'

import { directusAssetUrl, sanitizeImageUrl } from '../editor/media'

const props = defineProps<{
	editor: Editor
	disabled?: boolean
	initialType?: 'image' | 'video'
}>()
const open = defineModel<boolean>({ default: false })
const activeTab = ref('image')
const source = ref('')
const editing = shallowRef(false)
const canApply = computed(() => Boolean(sanitizeImageUrl(source.value)))
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
		source.value = typeof attrs.src === 'string' ? attrs.src : ''
	},
)

/**
 * Store a selected Directus asset as the media source.
 * @param value The selected Directus file.
 * @returns Nothing.
 */
function onFileSelect(value: unknown) {
	if (Array.isArray(value)) {
		onFileSelect(value[0])
		return
	}
	if (!value || typeof value !== 'object' || !('id' in value)) return
	const id = value.id
	if (typeof id !== 'string') return
	const url = directusAssetUrl(id)
	if (url) source.value = url
}

/**
 * Insert or update the selected media node.
 * @returns Nothing.
 */
function save() {
	if (!canApply.value || props.disabled) return
	const src = sanitizeImageUrl(source.value)
	if (!src) return
	const nodeType = activeTab.value === 'video' ? 'video' : 'image'
	const chain = props.editor.chain().focus()
	if (editing.value && props.editor.isActive(nodeType)) chain.updateAttributes(nodeType, { src })
	else
		chain.insertContent({
			type: nodeType,
			attrs: nodeType === 'image' ? { src, alt: '', title: null } : { src },
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
			<VUpload
				:multiple="false"
				from-library
				from-url
				:accept="activeTab === 'video' ? 'video/*' : 'image/*'"
				@input="onFileSelect"
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
	min-width: 0;
	min-height: 14rem;
	padding: var(--content-padding, 1.125rem);
}
</style>
