<script setup lang="ts">
defineProps<{
	previewSource?: string
	disabled?: boolean
}>()

const emit = defineEmits<{
	select: [value: unknown]
	clear: []
}>()
</script>

<template>
	<div class="video-upload-field">
		<div v-if="previewSource" class="video-upload-field__preview">
			<video :src="previewSource" controls preload="metadata">
				A preview of the selected video is not available in this browser.
			</video>
			<VButton
				icon
				x-small
				secondary
				class="video-upload-field__clear"
				:disabled="disabled"
				aria-label="Deselect video"
				tooltip="Deselect video"
				@click="emit('clear')"
			>
				<VIcon name="close" />
			</VButton>
		</div>
		<VUpload
			:disabled="disabled"
			:multiple="false"
			from-library
			from-url
			accept="video/*"
			:filter="{ type: { _contains: 'video' } }"
			@input="emit('select', $event)"
		/>
	</div>
</template>

<style scoped>
.video-upload-field {
	display: grid;
	gap: 0.5rem;
}

.video-upload-field__preview {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	min-block-size: 8rem;
	padding: 0.5rem;
	background: var(--theme--background-subdued, #f7f9fd);
	border: var(--theme--border-width, 1px) solid
		var(--theme--form--field--input--border-color, #d3dae4);
	border-radius: var(--theme--border-radius, 6px);
}

.video-upload-field__clear {
	position: absolute;
	inset-block-start: 0.5rem;
	inset-inline-end: 0.5rem;
}

.video-upload-field__preview video {
	display: block;
	max-inline-size: 100%;
	max-block-size: 18rem;
	border-radius: calc(var(--theme--border-radius, 6px) / 2);
}
</style>
