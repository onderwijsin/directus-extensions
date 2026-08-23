<script setup lang="ts">
import type { Locale } from '../shared/configuration/locales'

/** Thin Directus interface adapter that configures the shared slug input. */
import SluggernautInput from '../shared/components/SluggernautInput.vue'

const props = withDefaults(
	defineProps<{
		value?: string | null
		disabled?: boolean
		nonEditable?: boolean
		locale?: Locale
	}>(),
	{ value: null, disabled: false, nonEditable: false },
)

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()
</script>

<template>
	<SluggernautInput
		:value="props.value"
		:disabled="props.disabled"
		:non-editable="props.nonEditable"
		:locale="props.locale"
		field-type="slug"
		@input="emit('input', $event)"
	/>
</template>
