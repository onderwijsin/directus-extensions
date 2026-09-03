<script setup lang="ts">
import type { Editor } from '@tiptap/core'

import { computed, ref, watch } from 'vue'

import { directusAssetUrl, sanitizeImageUrl } from '../editor/media'
import DirectusButton from '../ui/DirectusButton.vue'
import DirectusDrawer from '../ui/DirectusDrawer.vue'
import DirectusUpload from '../ui/DirectusUpload.vue'

const props = defineProps<{
	editor: Editor
	disabled?: boolean
	initialType?: 'image' | 'video'
}>()
const open = defineModel<boolean>({ default: false })
const activeTab = ref('image')
const source = ref('')
const editing = computed(() => Boolean(source.value))
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
		const attrs = props.editor.isActive(nodeType) ? props.editor.getAttributes(nodeType) : {}
		source.value = typeof attrs.src === 'string' ? attrs.src : ''
	},
)

/**
 * Store a selected Directus asset as the media source.
 * @param value The selected Directus file.
 * @returns Nothing.
 */
function onFileSelect(value: unknown) {
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
	if (!editing.value || props.disabled) return
	props.editor.chain().focus().deleteSelection().run()
	open.value = false
}
</script>

<template>
	<DirectusDrawer
		v-model="open"
		:title="drawerTitle"
		icon="slideshow"
		@cancel="open = false"
		@apply="save"
	>
		<div class="media-drawer__content">
			<DirectusUpload
				:accept="activeTab === 'video' ? 'video/*' : 'image/*'"
				@select="onFileSelect"
			/>
		</div>
		<template #actions>
			<DirectusButton v-if="editing" label="Delete" :disabled="disabled" @click="remove" />
		</template>
		<template #actions:primary>
			<DirectusButton
				:label="saveLabel"
				primary
				:disabled="disabled || !canApply"
				@click="save"
			/>
		</template>
	</DirectusDrawer>
</template>

<style scoped>
.media-drawer__content {
	min-width: 0;
	min-height: 14rem;
}
</style>
