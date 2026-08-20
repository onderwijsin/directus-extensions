<script setup lang="ts">
import type { ApplicationSummary, DeploymentSummary } from './types'

import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

import ActiveDeploymentList from './components/ActiveDeploymentList.vue'
import ApplicationList from './components/ApplicationList.vue'
import DeploymentList from './components/DeploymentList.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import NoDeploymentsInProgress from './components/NoDeploymentsInProgress.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'
import { deploymentPath, deploymentSummaryPath } from './utils'

const api = useCoolifyDeploymentsApi()
const applications = shallowRef<ApplicationSummary[]>([])
const current = shallowRef<DeploymentSummary[]>([])
const recent = shallowRef<DeploymentSummary[]>([])
const canCreateApplications = shallowRef(false)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
let poller: ReturnType<typeof setInterval> | undefined
const applicationCreatePath = computed(
	() => `/content/${encodeURIComponent(api.getApplicationsCollection())}/+`,
)

/**
 * Load applications and deployment summaries for the dashboard.
 * @returns Nothing.
 */
const load = async () => {
	try {
		applications.value = await api.listApplications()
		canCreateApplications.value = await api.canCreateApplications()
		const deployments = await Promise.all(
			applications.value.map((application) =>
				api.listDeployments(application.directusApplicationId),
			),
		)
		const allDeployments = deployments.flat()
		const applicationById = new Map(
			applications.value.map((application) => [
				application.directusApplicationId,
				application,
			]),
		)
		const enrichedDeployments = allDeployments.map((deployment) => ({
			...deployment,
			applicationName: applicationById.get(deployment.directusApplicationId)?.name ?? null,
			environmentName:
				applicationById.get(deployment.directusApplicationId)?.environmentName ?? null,
		}))
		current.value = enrichedDeployments.filter((deployment) =>
			['queued', 'building'].includes(deployment.status),
		)
		recent.value = [...enrichedDeployments]
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
	void (async () => {
		await load()
		poller = setInterval(() => void load(), api.getPollingInterval())
	})()
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
					<v-button v-if="canCreateApplications" :to="applicationCreatePath">
						<v-icon name="add" /> Add your first application
					</v-button>
					<p v-else>Ask your administrator to add your first Coolify application.</p>
				</v-info>
			</template>
			<template v-else>
				<section>
					<h2>Current deployments</h2>
					<NoDeploymentsInProgress v-if="current.length === 0" />
					<ActiveDeploymentList
						v-else
						:deployments="current"
						:application-path="deploymentSummaryPath"
					/>
				</section>
				<section>
					<h2>Recent deployments</h2>
					<DeploymentList
						:deployments="recent"
						empty-title="No recent deployments"
						empty-copy="Deployment history will appear here when an application is deployed."
						:application-path="deploymentSummaryPath"
					/>
				</section>
				<section>
					<h2>Applications</h2>
					<ApplicationList
						:applications="applications"
						:application-path="deploymentPath"
					/>
				</section>
			</template>
		</div>
	</private-view>
</template>

<style scoped>
.module-page {
	display: grid;
	gap: 32px;
	padding: var(--content-padding);
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
