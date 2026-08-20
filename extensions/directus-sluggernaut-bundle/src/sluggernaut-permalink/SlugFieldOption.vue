<script setup lang="ts">
/**
 * Configuration control for selecting a Sluggernaut slug dependency.
 *
 * The list is loaded from Directus for the currently selected collection and is intentionally
 * limited to fields using the Sluggernaut slug interface.
 */
import { computed, onMounted, shallowRef, watch } from 'vue'

import { useApi } from '@directus/extensions-sdk'
import { isArray, isRecord } from '@onderwijsin/directus-extension-utils'

import { fieldMetadataSchema } from '../shared/configuration/field-metadata.schema'

interface FieldOption {
	field: string
	label: string
}

const props = withDefaults(
	defineProps<{
		value?: string | null
		collection?: string | null
		disabled?: boolean
	}>(),
	{ value: null, collection: null, disabled: false },
)

const emit = defineEmits<{
	(event: 'input', value: string | null): void
}>()

const api = useApi()
const options = shallowRef<FieldOption[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)

const selectedValue = computed(() => props.value ?? '')

/**
 * Loads the Sluggernaut slug fields for the selected collection.
 * @returns A promise that resolves after the options are loaded.
 */
async function loadOptions(): Promise<void> {
	if (!props.collection) {
		options.value = []
		error.value = null
		return
	}

	loading.value = true
	error.value = null
	try {
		// The fields endpoint may return additional Directus metadata; validate each row before use.
		const response = await api.get(`/fields/${encodeURIComponent(props.collection)}`)
		const body = isRecord(response.data) ? response.data : null
		const fields = body !== null && isArray(body.data) ? body.data : []
		options.value = fields.flatMap((value): FieldOption[] => {
			const parsed = fieldMetadataSchema.safeParse(value)
			if (!parsed.success || parsed.data.meta?.interface !== 'sluggernaut-slug') return []
			return [{ field: parsed.data.field, label: parsed.data.field }]
		})

		if (props.value === null && options.value.length === 1) {
			// Selecting the sole valid dependency removes an unnecessary extra configuration step.
			emit('input', options.value[0]?.field ?? null)
		}
	} catch {
		options.value = []
		error.value = 'Unable to load Sluggernaut slug fields.'
	} finally {
		loading.value = false
	}
}

/**
 * Emits the selected slug field.
 * @param event - Native select change event.
 * @returns void.
 */
function handleChange(event: Event): void {
	const target = event.target
	if (!(target instanceof HTMLSelectElement)) return
	emit('input', target.value === '' ? null : target.value)
}

onMounted(loadOptions)
watch(() => props.collection, loadOptions)
</script>

<template>
	<select
		class="sluggernaut-slug-field-option"
		:value="selectedValue"
		:disabled="disabled || loading || options.length === 0"
		@change="handleChange"
	>
		<option value="">Select a Sluggernaut slug field</option>
		<option v-for="option in options" :key="option.field" :value="option.field">
			{{ option.label }}
		</option>
	</select>
	<p v-if="error" class="sluggernaut-slug-field-option__error" role="alert">{{ error }}</p>
</template>

<style scoped>
.sluggernaut-slug-field-option {
	box-sizing: border-box;
	width: 100%;
	min-height: 40px;
	padding: 0.5rem;
	color: var(--theme--foreground);
	background: var(--theme--background);
	border: 1px solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
}

.sluggernaut-slug-field-option__error {
	margin: 0.25rem 0 0;
	color: var(--theme--danger);
	font-size: 0.75rem;
}
</style>
