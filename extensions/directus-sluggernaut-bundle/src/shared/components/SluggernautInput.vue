<script setup lang="ts">
/**
 * Shared locked/unlocked input used by the slug and permalink interfaces.
 *
 * Values start locked to protect generated fields from accidental edits. Manual input is emitted
 * only after the user unlocks the control, while copy support remains available in both states.
 */
import { computed, shallowRef } from 'vue'

import { translations, type Locale } from '../configuration/locales'
import CopyButton from './CopyButton.vue'

const props = withDefaults(
	defineProps<{
		value: string | null
		disabled?: boolean
		nonEditable?: boolean
		locale?: Locale
		fieldType: 'slug' | 'path'
		errorMessage?: string | null
		generateFromSlug?: boolean
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
	if (props.fieldType === 'slug') return translations.slug[props.locale]

	if (props.generateFromSlug) return translations.path[props.locale]

	return '/news/hello-world'
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
			<CopyButton v-if="!!value" :value="value" />
		</div>
		<v-button
			v-if="!nonEditable && !disabled"
			secondary
			icon
			class="sluggernaut-input__lock-button"
			:aria-label="locked ? 'Unlock field' : 'Lock field'"
			:tooltip="locked ? 'Unlock field' : 'Lock field'"
			@click="locked = !locked"
		>
			<v-icon :name="locked ? 'lock' : 'lock_open'" small />
		</v-button>
	</div>
</template>

<style scoped>
.sluggernaut-input {
	display: flex;
	align-items: stretch;
	gap: 0.5rem;
	width: 100%;
}

.sluggernaut-input__input {
	position: relative;
	flex: 1;
}

.sluggernaut-copy-button {
	position: absolute;
	right: 0.5rem;
	top: 50%;
	transform: translateY(-50%);
}

.sluggernaut-input__lock-button {
	width: var(--theme--form--field--input--height);
	height: var(--theme--form--field--input--height);
	flex: 0 0 var(--theme--form--field--input--height);
}

.sluggernaut-input__lock-button :deep(.button) {
	width: 100%;
	height: 100%;
	padding: 0;
}
</style>
