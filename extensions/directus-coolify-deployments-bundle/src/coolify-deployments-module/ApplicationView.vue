<script setup lang="ts">
import type { ApplicationSummary, DeploymentSummary } from './types'

import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import ApplicationStateBadge from './components/ApplicationStateBadge.vue'
import DeploymentList from './components/DeploymentList.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'
import { deploymentPath, deploymentSummaryPath, formatDate, repositoryUrl } from './utils'

const props = defineProps<{ directusApplicationId: string }>()
const api = useCoolifyDeploymentsApi()
const router = useRouter()
const application = shallowRef<ApplicationSummary | null>(null)
const deployments = shallowRef<DeploymentSummary[]>([])
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
const showDeployConfirmation = shallowRef(false)
const canTriggerDeployments = shallowRef(false)
const page = shallowRef(1)
const pageSize = 10
const totalPages = computed(() => Math.max(1, Math.ceil(deployments.value.length / pageSize)))
const paginatedDeployments = computed(() =>
	deployments.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
/**
 * Load the selected application and its deployment history.
 * @returns Nothing.
 */
const load = async () => {
	loading.value = true
	error.value = null
	application.value = null
	deployments.value = []
	canTriggerDeployments.value = false
	page.value = 1
	try {
		const dashboard = await api.getDashboard()
		canTriggerDeployments.value = dashboard.canTriggerDeployments
		application.value =
			dashboard.applications.find(
				(item) => item.directusApplicationId === props.directusApplicationId,
			) ?? null
		deployments.value = await api.listDeployments(props.directusApplicationId)
		if (!application.value) error.value = 'Application not found'
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load application'
	} finally {
		loading.value = false
	}
}

/**
 * Start a deployment for the selected application.
 * @returns Nothing.
 */
const deploy = async () => {
	showDeployConfirmation.value = false
	loading.value = true
	try {
		const deploymentId = await api.deploy(props.directusApplicationId)
		await router.push(deploymentPath(props.directusApplicationId, deploymentId))
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to deploy application'
	} finally {
		loading.value = false
	}
}

watch(
	() => props.directusApplicationId,
	() => void load(),
	{ immediate: true },
)
</script>

<template>
	<private-view :title="application?.name ?? 'Application'">
		<template #title-outer:prepend>
			<v-button
				icon
				:primary="false"
				:small="true"
				:normal="false"
				tooltip="Back"
				:to="`/coolify-deployments`"
				class="ghost back-button header-button"
				aria-label="Back to deployments"
				:active="false"
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
					aria-label="Refresh application"
					@click="load"
					><v-icon name="refresh"
				/></v-button>
				<v-button
					v-if="canTriggerDeployments"
					:loading="loading"
					@click="showDeployConfirmation = true"
				>
					Deploy
					<v-icon name="rocket_launch" style="margin-left: 5px" />
				</v-button>
			</div>
		</template>
		<v-dialog v-model="showDeployConfirmation">
			<v-card>
				<v-card-title>Deploy application?</v-card-title>
				<v-card-text>
					This will start a new deployment for
					{{ application?.name ?? 'this application' }}.
				</v-card-text>
				<v-card-actions>
					<v-button secondary @click="showDeployConfirmation = false">Cancel</v-button>
					<v-button :loading="loading" @click="deploy">
						<v-icon name="rocket_launch" /> Deploy
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
		<div class="page">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" class="loading-layout">
				<LoadingSkeleton :lines="2" />
				<LoadingSkeleton :lines="4" />
			</div>
			<section v-if="application">
				<h2>Application details</h2>
				<div class="metadata-panel">
					<div class="metadata">
						<div>
							<span><v-icon name="public" small /> Application URL</span>
							<a
								v-if="application.url"
								:href="application.url"
								target="_blank"
								rel="noopener"
								><span class="truncate" style="text-transform: none">{{
									application.url
								}}</span></a
							><strong v-else>—</strong>
						</div>
						<div>
							<span><v-icon name="folder" small /> Project</span
							><strong>{{ application.projectName ?? '—' }}</strong>
						</div>
						<div>
							<span><v-icon name="account_tree" small /> Branch</span
							><strong>{{ application.gitBranch ?? '—' }}</strong>
						</div>
						<div>
							<span><v-icon name="commit" small /> Commit</span
							><strong class="mono" translate="no">{{
								application.gitCommitSha ?? '—'
							}}</strong>
						</div>
						<div>
							<span><v-icon name="history" small /> Last deployment</span
							><strong>{{
								formatDate(application.latestDeployment?.createdAt ?? null)
							}}</strong>
						</div>
						<div>
							<span><v-icon name="monitor_heart" small /> Status</span
							><ApplicationStateBadge :state="application.state" :xSmall="true" />
						</div>
						<div>
							<span><v-icon name="layers" small /> Environment</span
							><strong>{{ application.environmentName ?? '—' }}</strong>
						</div>
						<div>
							<span><v-icon name="code" small /> Repository</span>
							<a
								v-if="repositoryUrl(application.gitRepository)"
								:href="repositoryUrl(application.gitRepository) ?? undefined"
								target="_blank"
								rel="noopener"
								translate="no"
								>{{ application.gitRepository }}</a
							>
							<strong v-else>—</strong>
						</div>
						<div>
							<span><v-icon name="build" small /> Build pack</span
							><strong>{{ application.buildPack ?? '—' }}</strong>
						</div>
						<div>
							<span><v-icon name="dns" small /> Server</span
							><strong>{{ application.serverName ?? '—' }}</strong>
						</div>
					</div>
				</div>
			</section>
			<section v-if="!loading">
				<h2>Deployment history</h2>
				<DeploymentList
					:deployments="paginatedDeployments"
					:application-path="deploymentSummaryPath"
					empty-title="No deployments yet"
					empty-copy="Deploy this application to create its first deployment."
				/>
				<v-pagination v-if="totalPages > 1" v-model="page" :length="totalPages" />
			</section>
		</div>
	</private-view>
</template>

<style scoped>
.page {
	display: grid;
	gap: 24px;
	padding: var(--content-padding);
}
.header-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}
.metadata-panel {
	display: grid;
	gap: 16px;
	padding: 20px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
}
.metadata {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 28px 32px;
}
.metadata > div {
	display: grid;
	gap: 4px;
}
.metadata span {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	color: var(--foreground-subdued);
	font-size: 12px;
	opacity: 0.8;
	text-transform: uppercase;
}
.metadata a {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	gap: 0.35rem;
	color: var(--primary);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.truncate {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	text-transform: none;
	white-space: nowrap;
}
.metadata :deep(.application-state) {
	justify-self: start;
	width: max-content;
	font-size: 12px;
	padding: 6px 10px;
}
.icon-value {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}
.mono {
	font-family: var(--family-monospace);
	overflow-wrap: anywhere;
}
section {
	display: grid;
	gap: 12px;
}
@media (max-width: 900px) {
	.metadata {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
@media (max-width: 600px) {
	.metadata {
		grid-template-columns: minmax(0, 1fr);
	}
}
h2 {
	margin: 0;
	font-size: 18px;
}
</style>
