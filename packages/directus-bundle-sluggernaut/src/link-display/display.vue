<script lang="ts" setup>
import CopyButton from "../shared/CopyButton.vue";

defineProps<{
	value: string | null;
}>();
</script>

<template>
	<div class="link-display">
		<span>{{ value }}</span>
		<CopyButton :value="value" x-small class="copy-btn-display" />
	</div>
</template>

<style scoped>
.link-display {
	position: relative;
	display: flex;
	flex-direction: row;
	gap: 1rem;
	align-items: center;
	width: 100%;
}
.copy-btn-display {
	right: -12px;
}
</style>
