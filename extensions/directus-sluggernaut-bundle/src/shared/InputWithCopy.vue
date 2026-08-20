<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import CopyButton from './CopyButton.vue'

const props = withDefaults(
	defineProps<{
		value: string | null
		disabled?: boolean
		locale?: string
		fieldType: 'slug' | 'path'
	}>(),
	{
		disabled: false,
		locale: 'en',
	},
)

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()

const locked = shallowRef(true)
const placeholder = computed(() => {
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
	<div class="sluggernaut-input-with-copy">
		<div class="sluggernaut-input-with-copy__input">
			<v-input
				:model-value="value ?? ''"
				:disabled="locked || disabled"
				:placeholder="placeholder"
				@update:model-value="handleChange"
			/>
			<CopyButton :value="value" />
		</div>
		<v-button
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
.sluggernaut-input-with-copy {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
}

.sluggernaut-input-with-copy__input {
	position: relative;
	flex: 1;
}

.sluggernaut-input-with-copy__input :deep(.sluggernaut-copy-button) {
	position: absolute;
	right: 0.5rem;
	top: 50%;
	transform: translateY(-50%);
}
</style>
