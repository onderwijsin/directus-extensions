<script setup lang="ts">
import type { ApplicationSummary, DeploymentSummary } from './types'

import { onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'

import DeploymentList from './components/DeploymentList.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const props = defineProps<{ applicationId: string }>()
const api = useCoolifyDeploymentsApi()
const router = useRouter()
const application = shallowRef<ApplicationSummary | null>(null)
const deployments = shallowRef<DeploymentSummary[]>([])
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
/**
 *
 */
/**
 * Build a deployment Studio route.
 * @param deployment - Deployment to open.
 * @returns Studio route.
 */
const deploymentPath = (deployment: DeploymentSummary) =>
	`/admin/coolify-deployments/applications/${encodeURIComponent(props.applicationId)}/deployments/${encodeURIComponent(deployment.id)}`
/**
 * Build a deployment route from an identifier.
 * @param deploymentId - Deployment identifier.
 * @returns Studio route.
 */
const deploymentIdPath = (deploymentId: string) =>
	`/admin/coolify-deployments/applications/${encodeURIComponent(props.applicationId)}/deployments/${encodeURIComponent(deploymentId)}`

/**
 *
 */
/** @returns Nothing. */
const load = async () => {
	loading.value = true
	try {
		const applications = await api.listApplications()
		application.value = applications.find((item) => item.id === props.applicationId) ?? null
		deployments.value = await api.listDeployments(props.applicationId)
		if (!application.value) error.value = 'Application not found'
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load application'
	} finally {
		loading.value = false
	}
}

/**
 *
 */
/** @returns Nothing. */
const deploy = async () => {
	loading.value = true
	try {
		const deploymentId = await api.deploy(props.applicationId)
		await router.push(deploymentIdPath(deploymentId))
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to deploy application'
	} finally {
		loading.value = false
	}
}

onMounted(() => void load())
</script>

<template>
	<private-view :title="application?.name ?? 'Application'">
		<template #actions>
			<v-button secondary @click="load"><v-icon name="refresh" /> Refresh</v-button>
			<v-button :loading="loading" @click="deploy"
				><v-icon name="rocket_launch" /> Deploy</v-button
			>
		</template>
		<div class="page">
			<v-button secondary to="/admin/coolify-deployments"
				><v-icon name="arrow_back" /> Back to deployments</v-button
			>
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" class="loading-layout">
				<LoadingSkeleton :lines="2" />
				<LoadingSkeleton :lines="4" />
			</div>
			<div v-if="application" class="metadata">
				<div>
					<span>Application URL</span
					><a
						v-if="application.url"
						:href="application.url"
						target="_blank"
						rel="noopener"
						>{{ application.url }}</a
					><strong v-else>—</strong>
				</div>
				<div>
					<span>Project</span><strong>{{ application.projectName ?? '—' }}</strong>
				</div>
			</div>
			<section v-if="!loading">
				<h2>Deployment history</h2>
				<DeploymentList
					:deployments="deployments"
					:application-path="deploymentPath"
					empty-title="No deployments yet"
					empty-copy="Deploy this application to create its first deployment."
				/>
			</section>
		</div>
	</private-view>
</template>

<style scoped>
.page {
	display: grid;
	gap: 24px;
	padding: 24px;
}
.metadata {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 12px;
}
.metadata > div {
	display: grid;
	gap: 6px;
	padding: 16px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
}
.metadata span {
	color: var(--foreground-subdued);
	font-size: 12px;
	text-transform: uppercase;
}
.metadata a {
	color: var(--primary);
	overflow-wrap: anywhere;
}
section {
	display: grid;
	gap: 12px;
}
h2 {
	margin: 0;
	font-size: 18px;
}
</style>
