<script setup lang="ts">
import { computed } from 'vue'

import { isString } from '@onderwijsin/directus-extension-utils'

const props = defineProps<{
	id?: string
	describedBy?: string
	invalid?: boolean
	required?: boolean
	disabled?: boolean
	values: string[]
}>()
const model = defineModel<string[]>({ required: true })
const items = computed(() => props.values.map((value) => ({ text: value, value })))

/**
 * Keep only string choices returned by Directus.
 * @param value Selected values.
 * @returns Nothing.
 */
function update(value: unknown) {
	model.value = Array.isArray(value) ? value.filter(isString) : []
}
</script>

<template>
	<VSelect
		:id="id"
		:model-value="model"
		:items="items"
		:aria-describedby="describedBy"
		:aria-invalid="invalid || undefined"
		:aria-required="required || undefined"
		:disabled="disabled"
		multiple
		@update:model-value="update"
	/>
</template>
