<script setup lang="ts">
defineProps<{
	metadataError: boolean
	referencesNeedAttention: boolean
	componentsNeedAttention: boolean
}>()

const emit = defineEmits<{
	showReferenceReport: []
	showComponentReport: []
}>()
</script>

<template>
	<p v-if="metadataError" class="editor-notices__bar editor-notices__bar--danger" role="alert">
		Component metadata could not be loaded. Markdown editing is still available.
	</p>
	<div v-if="referencesNeedAttention" class="editor-notices__bar" role="status">
		<span>Some item references need attention.</span>
		<VButton
			x-small
			secondary
			class="editor-notices__action"
			@click="emit('showReferenceReport')"
			>Show report</VButton
		>
	</div>
	<div v-if="componentsNeedAttention" class="editor-notices__bar" role="status">
		<span>Some components need attention.</span>
		<VButton
			x-small
			secondary
			class="editor-notices__action"
			@click="emit('showComponentReport')"
			>Show report</VButton
		>
	</div>
</template>

<style scoped>
.editor-notices__bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.5rem 1rem;
	border-block-end: 1px solid var(--theme--border-color-subdued, #edf0f2);
	background: color-mix(in srgb, var(--theme--warning, #f2c94c) 10%, transparent);
	color: var(--theme--warning-foreground, #7a5b00);
	font-size: 0.75rem;
}

.editor-notices__bar--danger {
	margin: 0;
	background: transparent;
	color: var(--theme--danger, #e35169);
	font-size: 0.8rem;
}

.editor-notices__action {
	--v-button-color: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-color-hover: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-color-active: var(--theme--warning-foreground, #7a5b00) !important;
	--v-button-background-color: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 12%,
		transparent
	) !important;
	--v-button-background-color-hover: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 18%,
		transparent
	) !important;
	--v-button-background-color-active: color-mix(
		in srgb,
		var(--theme--warning, #f2c94c) 22%,
		transparent
	) !important;
}
</style>
