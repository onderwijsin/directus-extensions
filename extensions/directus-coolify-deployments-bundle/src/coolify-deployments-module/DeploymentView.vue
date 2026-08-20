<script setup lang="ts">
import type { DeploymentSummary } from './types'

import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'

import DeploymentStatus from './components/DeploymentStatus.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'
import { deploymentPath, formatDate, formatDuration } from './utils'

const props = defineProps<{ directusApplicationId: string; deploymentId: string }>()
const api = useCoolifyDeploymentsApi()
const deployment = shallowRef<DeploymentSummary | null>(null)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
let poller: ReturnType<typeof setInterval> | undefined
const active = computed(
	() => deployment.value && ['queued', 'building'].includes(deployment.value.status),
)
/**
 * Load the selected deployment details.
 * @returns Nothing.
 */
const load = async () => {
	loading.value = true
	deployment.value = null
	error.value = null
	try {
		deployment.value = await api.getDeployment(props.directusApplicationId, props.deploymentId)
		error.value = null
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployment'
	} finally {
		loading.value = false
	}
}
/**
 * Cancel the selected active deployment.
 * @returns Nothing.
 */
const cancel = async () => {
	loading.value = true
	try {
		await api.cancelDeployment(props.directusApplicationId, props.deploymentId)
		await load()
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to cancel deployment'
	} finally {
		loading.value = false
	}
}
watch(
	() => [props.directusApplicationId, props.deploymentId],
	() => void load(),
	{ immediate: true },
)
onMounted(() => {
	poller = setInterval(() => {
		if (active.value) void load()
	}, api.getPollingInterval())
})
onUnmounted(() => {
	if (poller) clearInterval(poller)
})
</script>

<template>
	<private-view :title="`Deployment · ${props.deploymentId}`">
		<template #title-outer:prepend>
			<v-button
				icon
				:primary="false"
				:small="true"
				:normal="false"
				tooltip="Back"
				:to="deploymentPath(props.directusApplicationId)"
				class="ghost back-button header-button"
				aria-label="Back to application"
			>
				<v-icon name="arrow_back" />
			</v-button>
		</template>
		<template #actions>
			<div class="header-actions">
				<v-button
					icon
					rounded
					secondary
					:loading="loading"
					aria-label="Refresh deployment"
					@click="load"
					><v-icon name="refresh"
				/></v-button>
				<v-button v-if="active" danger :loading="loading" @click="cancel"
					><v-icon name="cancel" /> Cancel deployment</v-button
				>
			</div>
		</template>
		<div class="page">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" class="loading-layout">
				<LoadingSkeleton :lines="1" />
				<div class="metadata">
					<LoadingSkeleton v-for="item in 6" :key="item" :lines="2" />
				</div>
			</div>
			<div v-if="deployment" class="deployment-details">
				<div class="deployment-header">
					<h2>Deployment Details</h2>
					<div class="deployment-actions">
						<DeploymentStatus :status="deployment.status" />
						<v-button
							v-if="deployment.coolifyUrl"
							:href="deployment.coolifyUrl"
							target="_blank"
							rel="noopener"
							small
							>Open in Coolify <v-icon name="launch" style="margin-left: 4px" small
						/></v-button>
					</div>
				</div>
				<div class="metadata-card">
					<table class="metadata-table">
						<tbody>
							<tr>
								<td><v-icon name="web" small /> Application</td>
								<td>{{ deployment.applicationName ?? '—' }}</td>
							</tr>
							<tr>
								<td><v-icon name="fingerprint" small /> Deployment ID</td>
								<td class="mono">{{ deployment.id }}</td>
							</tr>
							<tr>
								<td><v-icon name="play_arrow" small /> Started</td>
								<td>{{ formatDate(deployment.startedAt) }}</td>
							</tr>
							<tr>
								<td><v-icon name="schedule" small /> Created</td>
								<td>{{ formatDate(deployment.createdAt) }}</td>
							</tr>
							<tr>
								<td><v-icon name="check_circle" small /> Finished</td>
								<td>{{ formatDate(deployment.finishedAt) }}</td>
							</tr>
							<tr>
								<td><v-icon name="timer" small /> Duration</td>
								<td>{{ formatDuration(deployment.duration) }}</td>
							</tr>
							<tr>
								<td><v-icon name="account_tree" small /> Branch</td>
								<td>{{ deployment.branch ?? '—' }}</td>
							</tr>
							<tr>
								<td><v-icon name="commit" small /> Commit</td>
								<td class="mono">{{ deployment.commitSha ?? '—' }}</td>
							</tr>
							<tr>
								<td><v-icon name="person" small /> Triggered by</td>
								<td>{{ deployment.triggeredBy ?? '—' }}</td>
							</tr>
							<tr v-if="deployment.commitMessage">
								<td><v-icon name="notes" small /> Commit message</td>
								<td>{{ deployment.commitMessage }}</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</private-view>
</template>

<style scoped>
.header-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}
.page {
	display: grid;
	gap: 24px;
	padding: var(--content-padding);
}
.loading-layout {
	display: grid;
	gap: 16px;
}
.deployment-details {
	display: flex;
	flex-direction: column;
	gap: 24px;
}
.mono {
	font-family: var(--family-monospace);
}
.deployment-header,
.deployment-actions {
	display: flex;
	align-items: center;
}
.deployment-header {
	justify-content: space-between;
	gap: 16px;
}
.deployment-header h2 {
	margin: 0;
	font-size: 18px;
}
.deployment-actions {
	gap: 12px;
}
.metadata-table {
	width: 100%;
	border-collapse: collapse;
}
.metadata-card {
	padding: 8px 20px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
}
.metadata-table td {
	padding: 12px 0;
	border-bottom: 1px solid var(--border-normal);
	vertical-align: top;
}
.metadata-table tr:last-child td {
	border-bottom: 0;
}
.metadata-table td:first-child {
	display: flex;
	align-items: center;
	width: 220px;
	gap: 0.35rem;
	color: var(--foreground-subdued);
	font-size: 12px;
	text-transform: uppercase;
}
.metadata-table td:last-child {
	word-break: break-word;
}
</style>
