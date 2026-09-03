<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const props = defineProps<{ name: string }>()
const instance = getCurrentInstance()
const iconComponent = instance?.appContext.components.VIcon
</script>

<template>
	<component :is="iconComponent" v-if="iconComponent" :name="props.name" />
	<span v-else aria-hidden="true">{{ props.name }}</span>
</template>
