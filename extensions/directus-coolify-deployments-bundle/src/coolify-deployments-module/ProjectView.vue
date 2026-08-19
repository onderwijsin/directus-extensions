<script setup lang="ts">
import type { NormalizedDeployment } from '../shared/coolify-client/schemas'

import { onMounted, shallowRef } from 'vue'

import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const props = defineProps<{ projectId: string }>()
const api = useCoolifyDeploymentsApi()
const deployments = shallowRef<NormalizedDeployment[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)

/**
 * Build the Studio route for a deployment.
 * @param deploymentId - Coolify deployment UUID.
 * @returns The deployment route.
 */
const deploymentPath = (deploymentId: string) =>
	`/admin/coolify-deployments/projects/${encodeURIComponent(props.projectId)}/deployments/${encodeURIComponent(deploymentId)}`

/**
 * Load deployment history for the configured project.
 * @returns Nothing.
 */
const loadDeployments = async () => {
	loading.value = true
	error.value = null

	try {
		deployments.value = await api.listDeployments(props.projectId)
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployments'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	void loadDeployments()
})
</script>

<template>
	<private-view :title="`Deployments · ${props.projectId}`">
		<div class="deployment-view">
			<v-button to="/admin/coolify-deployments">Back to projects</v-button>
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<v-notice v-else-if="loading" type="info">Loading deployments…</v-notice>
			<div v-else class="deployment-list">
				<div v-for="deployment in deployments" :key="deployment.id" class="deployment-row">
					<pre>{{ JSON.stringify(deployment, null, 2) }}</pre>
					<v-button :to="deploymentPath(deployment.id)">View deployment</v-button>
				</div>
			</div>
			<pre>{{ JSON.stringify(deployments, null, 2) }}</pre>
		</div>
	</private-view>
</template>

<style scoped>
.deployment-view {
	display: grid;
	gap: 16px;
	padding: 24px;
}

.deployment-list {
	display: grid;
	gap: 12px;
}

.deployment-row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 16px;
	border: 1px solid var(--border-normal);
	border-radius: 6px;
}

pre {
	max-width: 100%;
	overflow: auto;
	margin: 0;
	padding: 16px;
	background: var(--background-normal);
}
</style>
