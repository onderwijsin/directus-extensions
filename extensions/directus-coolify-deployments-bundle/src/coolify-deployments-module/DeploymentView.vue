<script setup lang="ts">
import type { DeploymentSummary } from './types'

import { onMounted, onUnmounted, shallowRef, computed } from 'vue'

import DeploymentStatus from './components/DeploymentStatus.vue'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const props = defineProps<{ applicationId: string; deploymentId: string }>()
const api = useCoolifyDeploymentsApi()
const deployment = shallowRef<DeploymentSummary | null>(null)
const loading = shallowRef(true)
const error = shallowRef<string | null>(null)
let poller: ReturnType<typeof setInterval> | undefined
const active = computed(
	() => deployment.value && ['queued', 'building'].includes(deployment.value.status),
)
const applicationPath = `/admin/coolify-deployments/applications/${encodeURIComponent(props.applicationId)}`

/**
 *
 */
/** @returns Nothing. */
const load = async () => {
	try {
		deployment.value = await api.getDeployment(props.applicationId, props.deploymentId)
		error.value = null
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to load deployment'
	} finally {
		loading.value = false
	}
}
/**
 *
 */
/** @returns Nothing. */
const cancel = async () => {
	loading.value = true
	try {
		await api.cancelDeployment(props.applicationId, props.deploymentId)
		await load()
	} catch (caughtError) {
		error.value =
			caughtError instanceof Error ? caughtError.message : 'Unable to cancel deployment'
	} finally {
		loading.value = false
	}
}
onMounted(() => {
	void load()
	poller = setInterval(() => {
		if (active.value) void load()
	}, 3000)
})
onUnmounted(() => {
	if (poller) clearInterval(poller)
})
</script>

<template>
	<private-view :title="`Deployment · ${props.deploymentId}`">
		<template #actions
			><v-button v-if="active" danger :loading="loading" @click="cancel"
				><v-icon name="cancel" /> Cancel deployment</v-button
			></template
		>
		<div class="page">
			<v-button secondary :to="applicationPath"
				><v-icon name="arrow_back" /> Back to application</v-button
			>
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<div v-if="loading" class="loading-layout">
				<LoadingSkeleton :lines="1" />
				<div class="metadata">
					<LoadingSkeleton v-for="item in 6" :key="item" :lines="2" />
				</div>
			</div>
			<div v-if="deployment" class="header">
				<DeploymentStatus :status="deployment.status" /><span class="mono">{{
					deployment.id
				}}</span>
			</div>
			<div v-if="deployment" class="metadata">
				<div
					v-for="item in [
						{ label: 'Created', value: deployment.createdAt },
						{ label: 'Started', value: deployment.startedAt },
						{ label: 'Finished', value: deployment.finishedAt },
						{
							label: 'Duration',
							value: deployment.duration ? `${deployment.duration}s` : null,
						},
						{ label: 'Branch', value: deployment.branch },
						{ label: 'Commit', value: deployment.commitSha },
						{ label: 'Triggered by', value: deployment.triggeredBy },
					]"
					:key="item.label"
				>
					<span>{{ item.label }}</span
					><strong>{{ item.value ?? '—' }}</strong>
				</div>
			</div>
			<div v-if="deployment?.commitMessage" class="message">
				<span>Commit message</span>
				<p>{{ deployment.commitMessage }}</p>
			</div>
			<a
				v-if="deployment?.coolifyUrl"
				:href="deployment.coolifyUrl"
				target="_blank"
				rel="noopener"
				>Open in Coolify <v-icon name="launch" small
			/></a>
		</div>
	</private-view>
</template>

<style scoped>
.page {
	display: grid;
	gap: 24px;
	padding: 24px;
}
.loading-layout {
	display: grid;
	gap: 16px;
}
.header {
	display: flex;
	align-items: center;
	gap: 16px;
}
.mono {
	font-family: var(--family-monospace);
}
.metadata {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
	gap: 12px;
}
.metadata > div,
.message {
	display: grid;
	gap: 6px;
	padding: 16px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
}
.metadata span,
.message span {
	color: var(--foreground-subdued);
	font-size: 12px;
	text-transform: uppercase;
}
.message p {
	margin: 0;
}
.page > a {
	color: var(--primary);
}
</style>
