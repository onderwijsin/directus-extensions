<script setup lang="ts">
import type { DeploymentSummary } from '../types'

import { useRouter } from 'vue-router'

import DeploymentStatus from './DeploymentStatus.vue'

withDefaults(
	defineProps<{
		deployments: DeploymentSummary[]
		applicationPath: (deployment: DeploymentSummary) => string
		emptyTitle?: string
		emptyCopy?: string
	}>(),
	{
		emptyTitle: 'No deployments found',
		emptyCopy: 'Deployment history will appear here when an application is deployed.',
	},
)
const router = useRouter()
</script>

<template>
	<v-info v-if="deployments.length === 0" icon="history" :title="emptyTitle" center>
		{{ emptyCopy }}
	</v-info>
	<table v-else class="deployment-table">
		<thead>
			<tr>
				<th>Deployment</th>
				<th>Status</th>
				<th>Commit</th>
				<th>Started</th>
				<th>Duration</th>
			</tr>
		</thead>
		<tbody>
			<tr
				v-for="deployment in deployments"
				:key="deployment.id"
				class="clickable"
				@click="router.push(applicationPath(deployment))"
			>
				<td>
					<span class="mono">{{ deployment.id }}</span
					><small>{{ deployment.commitMessage ?? '—' }}</small>
				</td>
				<td><DeploymentStatus :status="deployment.status" /></td>
				<td class="mono">{{ deployment.commitSha?.slice(0, 8) ?? '—' }}</td>
				<td>
					{{
						deployment.startedAt ? new Date(deployment.startedAt).toLocaleString() : '—'
					}}
				</td>
				<td>{{ deployment.duration ? `${deployment.duration}s` : '—' }}</td>
			</tr>
		</tbody>
	</table>
</template>

<style scoped>
.deployment-table {
	width: 100%;
	border-collapse: collapse;
	background: var(--background-subdued);
}
th,
td {
	padding: 12px 16px;
	text-align: left;
	border-bottom: 1px solid var(--border-normal);
}
th {
	color: var(--foreground-subdued);
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
}
.clickable {
	cursor: pointer;
}
.clickable:hover {
	background: var(--background-normal);
}
td:first-child {
	display: grid;
	gap: 4px;
}
small {
	color: var(--foreground-subdued);
}
.mono {
	font-family: var(--family-monospace);
}
.empty {
	display: grid;
	justify-items: center;
	gap: 12px;
	padding: 64px 24px;
	color: var(--foreground-subdued);
}
</style>
