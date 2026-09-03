<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackDrawer from './FallbackDrawer.vue'

const props = defineProps<{ modelValue?: boolean; title?: string; icon?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; cancel: []; apply: [] }>()
const instance = getCurrentInstance()
const drawerComponent = instance?.appContext.components.VDrawer ?? FallbackDrawer
</script>

<template>
	<component
		:is="drawerComponent"
		:model-value="props.modelValue"
		:title="props.title"
		:icon="props.icon"
		@update:model-value="emit('update:modelValue', $event)"
		@cancel="emit('cancel')"
		@apply="emit('apply')"
	>
		<div class="directus-drawer__content"><slot /></div>
		<template #actions><slot name="actions" /></template>
		<template #actions:primary><slot name="actions:primary" /></template>
	</component>
</template>

<style scoped>
.directus-drawer__content {
	padding: var(--content-padding, 1.125rem);
	padding-block-end: var(--content-padding, 1.125rem);
}
</style>
