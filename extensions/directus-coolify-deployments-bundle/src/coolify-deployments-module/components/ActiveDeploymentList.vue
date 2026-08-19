<script setup lang="ts">
import type { DeploymentSummary } from '../types'

import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import DeploymentStatus from './DeploymentStatus.vue'

defineProps<{
	deployments: DeploymentSummary[]
	applicationPath: (deployment: DeploymentSummary) => string
}>()

const router = useRouter()
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined

/**
 * Format the elapsed time since a deployment started.
 * @param deployment - Active deployment.
 * @returns Elapsed time label.
 */
const elapsed = (deployment: DeploymentSummary) => {
	const startedAt = deployment.startedAt ?? deployment.createdAt
	if (!startedAt) return '—'

	const seconds = Math.max(0, Math.floor((now.value - new Date(startedAt).getTime()) / 1000))
	const minutes = Math.floor(seconds / 60)
	const remainingSeconds = seconds % 60
	if (minutes < 60) return `${minutes}m ${remainingSeconds}s`

	const hours = Math.floor(minutes / 60)
	return `${hours}h ${minutes % 60}m`
}

onMounted(() => {
	ticker = setInterval(() => {
		now.value = Date.now()
	}, 1000)
})
onUnmounted(() => {
	if (ticker) clearInterval(ticker)
})
</script>

<template>
	<div class="active-deployment-grid">
		<button
			v-for="deployment in deployments"
			:key="deployment.id"
			type="button"
			class="active-deployment-card"
			@click="router.push(applicationPath(deployment))"
		>
			<div class="card-heading">
				<strong>{{ deployment.applicationName ?? deployment.id }}</strong>
				<DeploymentStatus :status="deployment.status" />
			</div>
			<div class="card-meta">
				<span><v-icon name="schedule" small /> {{ elapsed(deployment) }}</span>
			</div>
		</button>
	</div>
</template>

<style scoped>
.active-deployment-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}
.active-deployment-card {
	display: grid;
	gap: 16px;
	width: 100%;
	padding: 20px;
	border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border-normal));
	border-radius: 8px;
	background: var(--background-subdued);
	color: var(--foreground-normal);
	text-align: left;
	cursor: pointer;
}
.active-deployment-card:hover {
	background: color-mix(in srgb, var(--background-subdued) 92%, var(--foreground-normal));
	border-color: var(--primary);
}
.card-heading,
.card-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-width: 0;
	gap: 12px;
}
.card-heading strong {
	min-width: 0;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.card-meta {
	color: var(--foreground-subdued);
	font-size: 13px;
}
.card-meta span:last-child {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	white-space: nowrap;
}
.mono {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
@media (max-width: 700px) {
	.active-deployment-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
