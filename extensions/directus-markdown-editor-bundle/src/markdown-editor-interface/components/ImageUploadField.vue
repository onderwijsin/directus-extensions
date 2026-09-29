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
	<div class="image-upload-field">
		<div v-if="previewSource" class="image-upload-field__preview">
			<img :src="previewSource" alt="Selected image preview" />
			<VButton
				icon
				x-small
				secondary
				class="image-upload-field__clear"
				:disabled="disabled"
				aria-label="Deselect image"
				tooltip="Deselect image"
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
			accept="image/*"
			:filter="{ type: { _contains: 'image' } }"
			@input="emit('select', $event)"
		/>
	</div>
</template>

<style scoped>
.image-upload-field {
	display: grid;
	gap: 0.5rem;
}

.image-upload-field__preview {
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

.image-upload-field__clear {
	position: absolute;
	inset-block-start: 0.5rem;
	inset-inline-end: 0.5rem;
}

.image-upload-field__preview img {
	display: block;
	max-inline-size: 100%;
	max-block-size: 12rem;
	object-fit: contain;
	border-radius: calc(var(--theme--border-radius, 6px) / 2);
}
</style>
