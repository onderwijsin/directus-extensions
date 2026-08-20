<script setup lang="ts">
/**
 * Shared locked/unlocked input used by the slug and permalink interfaces.
 *
 * Values start locked to protect generated fields from accidental edits. Manual input is emitted
 * only after the user unlocks the control, while copy support remains available in both states.
 */
import { computed, shallowRef } from 'vue'

import CopyButton from './CopyButton.vue'

const props = withDefaults(
	defineProps<{
		value: string | null
		disabled?: boolean
		nonEditable?: boolean
		locale?: string
		fieldType: 'slug' | 'path'
		errorMessage?: string | null
	}>(),
	{
		disabled: false,
		nonEditable: false,
		locale: 'en',
		errorMessage: null,
	},
)

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()

const locked = shallowRef(true)
const placeholder = computed(() => {
	// Use examples only for the default locale; other locales may have different conventions.
	if (props.fieldType === 'slug') return props.locale === 'en' ? 'e.g. hello-world' : ''
	return props.locale === 'en' ? 'e.g. /news/hello-world' : ''
})

/**
 * Emits a manually edited value.
 * @param value - New input value.
 * @returns void
 */
function handleChange(value: string | number | null): void {
	emit('input', value === null ? '' : String(value))
}
</script>

<template>
	<div class="sluggernaut-input">
		<div class="sluggernaut-input__input">
			<v-input
				:model-value="value ?? ''"
				:disabled="locked || disabled || nonEditable"
				:placeholder="placeholder"
				:error="errorMessage !== null"
				@update:model-value="handleChange"
			/>
			<CopyButton :value="value" />
		</div>
		<v-button
			v-if="!nonEditable"
			secondary
			small
			:aria-label="locked ? 'Unlock field' : 'Lock field'"
			@click="locked = !locked"
		>
			<v-icon :name="locked ? 'lock' : 'lock_open'" small />
			{{ locked ? 'Unlock' : 'Lock' }}
		</v-button>
	</div>
</template>

<style scoped>
.sluggernaut-input {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
}

.sluggernaut-input__input {
	position: relative;
	flex: 1;
}

.sluggernaut-input__input :deep(.sluggernaut-copy-button) {
	position: absolute;
	right: 0.5rem;
	top: 50%;
	transform: translateY(-50%);
}
</style>
