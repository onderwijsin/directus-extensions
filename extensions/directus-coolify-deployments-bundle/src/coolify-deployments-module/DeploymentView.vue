<script setup lang="ts">
import type { NormalizedDeployment } from '../shared/types'

import { onMounted, shallowRef } from 'vue'

import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const props = defineProps<{ projectId: string; deploymentId: string }>()
const api = useCoolifyDeploymentsApi()
const deployment = shallowRef<NormalizedDeployment | null>(null)
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)

const projectPath = `/admin/coolify-deployments/projects/${encodeURIComponent(props.projectId)}`

/**
 * Load the selected deployment from the authenticated endpoint.
 * @returns Nothing.
 */
const loadDeployment = async () => {
	loading.value = true
	error.value = null

	try {
		deployment.value = await api.getDeployment(props.projectId, props.deploymentId)
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployment'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	void loadDeployment()
})
</script>

<template>
	<private-view :title="`Deployment · ${props.deploymentId}`">
		<div class="deployment-view">
			<v-button :to="projectPath">Back to project</v-button>
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<v-notice v-else-if="loading" type="info">Loading deployment…</v-notice>
			<pre>{{ JSON.stringify(deployment, null, 2) }}</pre>
		</div>
	</private-view>
</template>

<style scoped>
.deployment-view {
	display: grid;
	gap: 16px;
	padding: 24px;
}

pre {
	max-width: 100%;
	overflow: auto;
	padding: 16px;
	background: var(--background-normal);
}
</style>
