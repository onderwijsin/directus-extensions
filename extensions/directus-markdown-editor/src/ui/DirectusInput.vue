<script setup lang="ts">
import { getCurrentInstance } from 'vue'

import FallbackInput from './FallbackInput.vue'

const props = defineProps<{ placeholder?: string; autofocus?: boolean; label?: string }>()
const model = defineModel<string>({ default: '' })
const instance = getCurrentInstance()
const inputComponent = instance?.appContext.components.VInput ?? FallbackInput
</script>

<template>
	<component
		:is="inputComponent"
		v-model="model"
		:autofocus="props.autofocus"
		:label="props.label"
		:placeholder="props.placeholder"
		class="editor-input"
	/>
</template>
