<script setup lang="ts">
import { getCurrentInstance } from 'vue'

const props = defineProps<{ accept?: string }>()
const emit = defineEmits<{ select: [value: unknown] }>()
const instance = getCurrentInstance()
const uploadComponent = instance?.appContext.components.VUpload
/**
 * Editor callback.
 * @param value Parameter value.
 * @returns Callback result.
 */
function select(value: unknown) {
	if (Array.isArray(value)) {
		emit('select', value[0])
		return
	}
	emit('select', value)
}
</script>

<template>
	<component
		:is="uploadComponent"
		v-if="uploadComponent"
		:multiple="false"
		from-library
		from-url
		:accept="props.accept ?? 'image/*'"
		@input="select"
	/>
	<p v-else class="directus-upload__fallback">
		Directus file selection is available when this interface is running inside Studio. You can
		also enter a public image URL below.
	</p>
</template>

<style scoped>
.directus-upload__fallback {
	margin: 0;
	color: var(--theme--foreground-subdued, #8b98a5);
}
</style>
