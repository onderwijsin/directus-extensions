<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackMenu from './FallbackMenu.vue'

const props = defineProps<{
	modelValue?: boolean
	placement?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const instance = getCurrentInstance()
const menuComponent = instance?.appContext.components.VMenu ?? FallbackMenu
</script>

<template>
	<component
		:is="menuComponent"
		:model-value="props.modelValue"
		:placement="props.placement ?? 'bottom-start'"
		:show-arrow="true"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<template #activator="scope">
			<slot name="activator" v-bind="scope" />
		</template>
		<slot />
	</component>
</template>
