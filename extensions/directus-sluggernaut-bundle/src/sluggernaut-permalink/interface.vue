<script setup lang="ts">
import type { Locale } from '../shared/configuration/locales'

/** Thin Directus interface adapter that configures the shared path input. */
import SluggernautInput from '../shared/components/SluggernautInput.vue'

interface PermalinkProps {
	value?: string | null
	disabled?: boolean
	nonEditable?: boolean
	locale: Locale
	generateFromSlug: boolean
}

const props = withDefaults(defineProps<PermalinkProps>(), {
	value: null,
	disabled: false,
	nonEditable: false,
})

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()
</script>

<template>
	<SluggernautInput
		:value="props.value"
		:disabled="props.disabled"
		:non-editable="props.nonEditable"
		field-type="path"
		:generate-from-slug="props.generateFromSlug"
		@input="emit('input', $event)"
	/>
</template>
