<script setup lang="ts">
import type { ApplicationSummary, DeploymentSummary } from './types'

import { onMounted, onUnmounted, shallowRef } from 'vue'

import ApplicationList from './components/ApplicationList.vue'
import DeploymentList from './components/DeploymentList.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const api = useCoolifyDeploymentsApi()
const applications = shallowRef<ApplicationSummary[]>([])
const current = shallowRef<DeploymentSummary[]>([])
const recent = shallowRef<DeploymentSummary[]>([])
const canCreateApplications = shallowRef(false)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
let poller: ReturnType<typeof setInterval> | undefined

/**
 *
 */
/**
 * Build a Studio route.
 * @param applicationId - Stable application identifier.
 * @param deploymentId - Optional deployment identifier.
 * @returns Studio route.
 */
const path = (applicationId: string, deploymentId?: string) =>
	`/admin/coolify-deployments/applications/${encodeURIComponent(applicationId)}${deploymentId ? `/deployments/${encodeURIComponent(deploymentId)}` : ''}`

/**
 *
 */
/** @returns Nothing. */
const load = async () => {
	try {
		canCreateApplications.value = await api.canCreateApplications()
		applications.value = await api.listApplications()
		const deployments = await Promise.all(
			applications.value.map((application) => api.listDeployments(application.id)),
		)
		const allDeployments = deployments.flat()
		current.value = allDeployments.filter((deployment) =>
			['queued', 'building'].includes(deployment.status),
		)
		recent.value = [...allDeployments]
			.sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''))
			.slice(0, 10)
		error.value = null
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployments'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	void load()
	poller = setInterval(() => void load(), 3000)
})
onUnmounted(() => {
	if (poller) clearInterval(poller)
})
</script>

<template>
	<private-view title="Deployments">
		<template #actions
			><v-button icon rounded secondary :loading="loading" @click="load"
				><v-icon name="refresh" /></v-button
		></template>
		<div class="module-page">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<template v-if="loading">
				<div class="skeleton-stats">
					<LoadingSkeleton v-for="item in 4" :key="item" :lines="1" />
				</div>
				<LoadingSkeleton :lines="4" />
				<LoadingSkeleton :lines="4" />
			</template>
			<template v-else-if="applications.length === 0">
				<v-info icon="rocket_launch" title="No Coolify applications configured" center>
					<p style="margin-block-end: 1.375rem">
						Add your first Coolify application to start deploying from Directus.
					</p>
					<v-button v-if="canCreateApplications" to="/content/coolify_applications/+">
						<v-icon name="add" /> Add your first application
					</v-button>
					<p v-else>Ask your administrator to add your first Coolify application.</p>
				</v-info>
			</template>
			<template v-else>
				<section>
					<h2>Current deployments</h2>
					<DeploymentList
						:deployments="current"
						:application-path="
							(deployment) => path(deployment.applicationId, deployment.id)
						"
					/>
				</section>
				<section>
					<h2>Recent deployments</h2>
					<DeploymentList
						:deployments="recent"
						:application-path="
							(deployment) => path(deployment.applicationId, deployment.id)
						"
					/>
				</section>
				<section>
					<h2>Applications</h2>
					<ApplicationList :applications="applications" :application-path="path" />
				</section>
			</template>
		</div>
	</private-view>
</template>

<style scoped>
.module-page {
	display: grid;
	gap: 32px;
	padding: 24px;
}
.skeleton-stats {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 12px;
}
section {
	display: grid;
	gap: 12px;
}
h2 {
	margin: 0;
	font-size: 18px;
}
@media (max-width: 700px) {
	.skeleton-stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
