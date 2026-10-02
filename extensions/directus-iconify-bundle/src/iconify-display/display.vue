<script setup lang="ts">
import IconImage from '../shared/IconImage.vue'

withDefaults(defineProps<{ value?: string | null; useProxy?: boolean }>(), { useProxy: true })
</script>

<template>
	<IconImage v-if="value" class="iconify-display" :icon="value" :use-proxy="useProxy" />
</template>

<style scoped>
.iconify-display {
	width: 24px;
	height: 24px;
	vertical-align: middle;
}
</style>
