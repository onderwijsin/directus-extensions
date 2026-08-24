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
let poller: ReturnType<typeof setTimeout> | undefined
let requestInFlight = false
let requestSequence = 0
let disposed = false
const applicationCreatePath = computed(
	() => `/content/${encodeURIComponent(api.getApplicationsCollection())}/+`,
)

/**
 * Load applications and deployment summaries for the dashboard.
 * @returns Nothing.
 */
const load = async () => {
	if (requestInFlight) return
	requestInFlight = true
	const sequence = ++requestSequence
	try {
		const [dashboard, canCreate] = await Promise.all([
			api.getDashboard(),
			api.getCachedCanCreateApplications(),
		])
		if (sequence !== requestSequence) return
		applications.value = dashboard.applications
		current.value = dashboard.current
		recent.value = dashboard.recent
		canCreateApplications.value = canCreate
		error.value = null
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployments'
	} finally {
		loading.value = false
		requestInFlight = false
		if (!disposed && !document.hidden && !poller) {
			poller = setTimeout(
				() => {
					poller = undefined
					void load()
				},
				current.value.length > 0 ? api.getPollingInterval() : 30_000,
			)
		}
	}
}

/**
 * Pause polling while the document is hidden and refresh when it becomes visible.
 * @returns Nothing.
 */
const onVisibilityChange = () => {
	if (document.hidden) {
		if (poller) clearTimeout(poller)
		poller = undefined
	} else if (!requestInFlight) {
		void load()
	}
}

onMounted(() => {
	disposed = false
	void (async () => {
		document.addEventListener('visibilitychange', onVisibilityChange)
		await load()
	})()
})
onUnmounted(() => {
	disposed = true
	document.removeEventListener('visibilitychange', onVisibilityChange)
	if (poller) clearTimeout(poller)
	poller = undefined
	requestSequence += 1
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
