<script setup lang="ts">
import { computed } from 'vue'

import { Icon, addAPIProvider } from '@iconify/vue'
import { isIconName } from '@onderwijsin/directus-extension-utils/app/iconify'

const props = withDefaults(defineProps<{ icon: string; useProxy?: boolean }>(), { useProxy: true })
addAPIProvider('directus-iconify', {
	resources: [`${window.location.origin}/iconify`],
})
addAPIProvider('directus-iconify-public', {
	resources: ['https://api.iconify.design'],
})
const providerIcon = computed(() => {
	if (!isIconName(props.icon)) return null
	return props.useProxy === false
		? `@directus-iconify-public:${props.icon}`
		: `@directus-iconify:${props.icon}`
})
</script>

<template>
	<Icon
		v-if="providerIcon"
		class="iconify-image"
		:icon="providerIcon"
		role="img"
		:aria-label="icon"
	/>
</template>

<style scoped>
.iconify-image {
	width: 24px;
	height: 24px;
	display: block;
}
</style>
