<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import { useApi } from '@directus/extensions-sdk'

interface ApplicationOption {
	id: string
	name: string
}

const props = withDefaults(
	defineProps<{
		value?: string | null
		disabled?: boolean
	}>(),
	{ value: null, disabled: false },
)

const emit = defineEmits<{
	(event: 'input', value: string): void
}>()

const api = useApi()
const applications = shallowRef<ApplicationOption[]>([])
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)

const items = computed(() => {
	const options = applications.value.map((application) => ({
		text: application.name,
		value: application.id,
	}))
	if (props.value && !options.some((option) => option.value === props.value)) {
		options.push({ text: props.value, value: props.value })
	}
	return options
})
const selectedValue = computed({
	/**
	 * @returns The currently selected value from props
	 */
	get: () => props.value,
	/**
	 * @param value The new value to set.
	 * @returns void
	 */
	set: (value: string | null | undefined) => emit('input', value ?? ''),
})

/**
 * Load deployable applications for the operation select.
 * @returns Nothing.
 */
const loadApplications = async () => {
	loading.value = true
	error.value = null

	try {
		const response = await api.get<ApplicationOption[]>(
			'/coolify-deployments/operation/applications',
		)
		applications.value = response.data
	} catch {
		error.value = 'Unable to load Coolify applications.'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	void loadApplications()
})
</script>

<template>
	<div class="application-select">
		<VSelect
			v-model="selectedValue"
			:items="items"
			:disabled="props.disabled || loading || Boolean(error)"
			:loading="loading"
			:mandatory="false"
			:show-deselect="true"
		/>
		<v-notice v-if="error" type="warning">{{ error }}</v-notice>
		<v-notice v-else-if="!loading && applications.length === 0" type="info">
			No enabled, deploy-enabled Coolify applications are available.
		</v-notice>
	</div>
</template>

<style scoped>
.application-select {
	display: grid;
	gap: 8px;
}
</style>
