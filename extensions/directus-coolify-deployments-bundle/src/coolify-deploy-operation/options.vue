<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'

import { useApi } from '@directus/extensions-sdk'

interface CoolifyDeployOptions {
	application?: string
}

interface ApplicationOption {
	id: string
	name: string
}

const props = defineProps<{
	value?: CoolifyDeployOptions
}>()

const emit = defineEmits<{
	input: [value: CoolifyDeployOptions]
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
	const application = props.value?.application
	if (application && !options.some((option) => option.value === application)) {
		options.push({ text: application, value: application })
	}
	return options
})
const selectedValue = computed({
	/**
	 * @returns The currently selected value from props
	 */
	get: () => props.value?.application ?? null,
	/**
	 * @param value The new value to set.
	 * @returns void
	 */
	set: (value: string | null | undefined) =>
		emit('input', { ...props.value, application: value ?? '' }),
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
		<div class="type-label">Application <span class="required">*</span></div>
		<VSelect
			aria-label="Application"
			aria-required="true"
			v-model="selectedValue"
			:items="items"
			:disabled="loading || Boolean(error)"
			:loading="loading"
			:mandatory="false"
			:show-deselect="true"
		/>
		<p class="note">Select an enabled, deploy-enabled application.</p>
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
.required {
	color: var(--theme--danger);
}

.note {
	color: var(--theme--foreground-subdued);
}
</style>
