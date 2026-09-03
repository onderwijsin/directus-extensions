<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackButton from './FallbackButton.vue'

const props = defineProps<{
	active?: boolean
	disabled?: boolean
	icon?: boolean
	label?: string
	primary?: boolean
	tooltip?: string
	type?: 'button' | 'submit'
}>()

const instance = getCurrentInstance()
const buttonComponent = instance?.appContext.components.VButton ?? FallbackButton
</script>

<template>
	<component
		:is="buttonComponent"
		:active="props.active"
		:disabled="props.disabled"
		:ghost="!props.primary"
		:kind="props.primary ? 'normal' : undefined"
		:icon="!props.label"
		:small="true"
		:tooltip="props.tooltip"
		:type="props.type ?? 'button'"
		:title="props.tooltip"
		class="editor-button"
	>
		<slot name="icon" />
		<slot>{{ props.label }}</slot>
	</component>
</template>

<style scoped>
.editor-button {
	flex: 0 0 auto;
}
</style>
