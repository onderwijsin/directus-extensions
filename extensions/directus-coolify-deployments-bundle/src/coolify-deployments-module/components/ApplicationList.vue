<script setup lang="ts">
import type { ApplicationSummary } from '../types'

import { useRouter } from 'vue-router'

import DeploymentStatus from './DeploymentStatus.vue'

defineProps<{ applications: ApplicationSummary[]; applicationPath: (id: string) => string }>()
const router = useRouter()
</script>

<template>
	<div v-if="applications.length === 0" class="empty">No configured applications found</div>
	<div v-else class="application-grid">
		<div
			v-for="application in applications"
			:key="application.id"
			class="application-card clickable"
			@click="router.push(applicationPath(application.id))"
		>
			<div class="application-heading">
				<v-icon name="web" /><strong>{{ application.name }}</strong>
			</div>
			<a
				v-if="application.url"
				:href="application.url"
				target="_blank"
				rel="noopener"
				@click.stop
				>{{ application.url }}</a
			>
			<span v-else class="subdued">No application URL configured</span>
			<div class="application-footer">
				<DeploymentStatus
					v-if="application.latestDeployment"
					:status="application.latestDeployment.status"
				/>
				<span v-else class="subdued">No deployments yet</span>
				<span class="subdued">{{
					application.latestDeployment?.createdAt
						? new Date(application.latestDeployment.createdAt).toLocaleString()
						: '—'
				}}</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.application-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
}
.application-card {
	display: grid;
	gap: 12px;
	padding: 20px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
}
.application-heading {
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 16px;
}
.application-card a {
	overflow: hidden;
	color: var(--primary);
	text-overflow: ellipsis;
	white-space: nowrap;
}
.application-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.clickable {
	cursor: pointer;
}
.clickable:hover {
	border-color: var(--primary);
}
.subdued,
.empty {
	color: var(--foreground-subdued);
}
.empty {
	padding: 32px;
	text-align: center;
}
</style>
