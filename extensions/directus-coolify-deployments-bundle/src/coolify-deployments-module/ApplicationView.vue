<script setup lang="ts">
import type { ApplicationSummary, DeploymentSummary } from './types'

import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { APPLICATION_DEPLOYMENT_PAGE_SIZE } from '../shared/constants'
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
const loadingApplication = shallowRef(true)
const loadingDeployments = shallowRef(true)
const loadingAction = shallowRef(false)
const error = shallowRef<string | null>(null)
const showDeployConfirmation = shallowRef(false)
const canTriggerDeployments = shallowRef(false)
const page = shallowRef(1)
let suppressPageWatch = false
const totalDeployments = shallowRef(0)
const totalPages = computed(() =>
	Math.max(1, Math.ceil(totalDeployments.value / APPLICATION_DEPLOYMENT_PAGE_SIZE)),
)
/**
 * Load the selected application's details and permissions.
 * @returns Nothing.
 */
const loadApplication = async () => {
	loadingApplication.value = true
	application.value = null
	canTriggerDeployments.value = false
	try {
		const dashboard = await api.getDashboard()
		canTriggerDeployments.value = dashboard.canTriggerDeployments
		application.value =
			dashboard.applications.find(
				(item) => item.directusApplicationId === props.directusApplicationId,
			) ?? null
		if (!application.value) error.value = 'Application not found'
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load application'
	} finally {
		loadingApplication.value = false
	}
}

/**
 * Load one page of deployment history without replacing application details.
 * @param requestedPage - One-based history page to request.
 * @returns Nothing.
 */
const loadDeployments = async (requestedPage = page.value) => {
	loadingDeployments.value = true
	error.value = null
	page.value = requestedPage
	try {
		const history = await api.listDeployments(props.directusApplicationId, {
			offset: (requestedPage - 1) * APPLICATION_DEPLOYMENT_PAGE_SIZE,
			limit: APPLICATION_DEPLOYMENT_PAGE_SIZE,
		})
		deployments.value = history.data
		totalDeployments.value = history.meta.total
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployment history'
	} finally {
		loadingDeployments.value = false
	}
}

/**
 * Refresh application details and the currently selected history page.
 * @returns Nothing.
 */
const load = async () => {
	suppressPageWatch = true
	page.value = 1
	try {
		await Promise.all([loadApplication(), loadDeployments(1)])
	} finally {
		suppressPageWatch = false
	}
}

/**
 * Start a deployment for the selected application.
 * @returns Nothing.
 */
const deploy = async () => {
	showDeployConfirmation.value = false
	loadingAction.value = true
	try {
		const deploymentId = await api.deploy(props.directusApplicationId)
		await router.push(deploymentPath(props.directusApplicationId, deploymentId))
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to deploy application'
	} finally {
		loadingAction.value = false
	}
}

watch(
	() => props.directusApplicationId,
	() => void load(),
	{ immediate: true },
)
watch(page, (value, previousValue) => {
	if (value !== previousValue && !suppressPageWatch) void loadDeployments(value)
})
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
					:loading="loadingApplication || loadingDeployments || loadingAction"
					aria-label="Refresh application"
					@click="load"
					><v-icon name="refresh"
				/></v-button>
				<v-button
					v-if="canTriggerDeployments"
					:loading="loadingAction"
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
					<v-button :loading="loadingAction" @click="deploy">
						<v-icon name="rocket_launch" /> Deploy
					</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
		<div class="page">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<section>
				<h2>Application details</h2>
				<LoadingSkeleton v-if="loadingApplication" :lines="4" />
				<div v-else-if="application" class="metadata-panel">
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
			<section>
				<h2>Deployment history</h2>
				<div v-if="loadingDeployments" class="history-loading">
					<LoadingSkeleton :lines="4" />
				</div>
				<template v-else>
					<DeploymentList
						:deployments="deployments"
						:application-path="deploymentSummaryPath"
						empty-title="No deployments yet"
						empty-copy="Deploy this application to create its first deployment."
					/>
					<v-pagination v-if="totalPages > 1" v-model="page" :length="totalPages" />
				</template>
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
