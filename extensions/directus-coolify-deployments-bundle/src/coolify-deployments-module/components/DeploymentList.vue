<script setup lang="ts">
import type { DeploymentSummary } from '../types'

import { useRouter } from 'vue-router'

import { formatDate, formatDuration } from '../utils'
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
	<div v-if="deployments.length === 0" class="empty-deployments-card">
		<v-info icon="history" :title="emptyTitle" center>
			{{ emptyCopy }}
		</v-info>
	</div>
	<table v-else class="deployment-table">
		<thead>
			<tr>
				<th>Application</th>
				<th>Environment</th>
				<th>Status</th>
				<th>Commit</th>
				<th>Date</th>
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
					<div class="application-cell">
						<strong>{{ deployment.applicationName ?? deployment.id }}</strong>
					</div>
				</td>
				<td>{{ deployment.environmentName ?? '—' }}</td>
				<td><DeploymentStatus :status="deployment.status" /></td>
				<td>
					<div class="commit-cell">
						<v-icon name="commit" small />
						<span class="mono">{{ deployment.commitSha?.slice(0, 8) ?? '—' }}</span>
					</div>
				</td>
				<td class="date-cell">
					{{ formatDate(deployment.createdAt) }}
				</td>
				<td>{{ formatDuration(deployment.duration) }}</td>
			</tr>
		</tbody>
	</table>
</template>

<style scoped>
.deployment-table {
	width: 100%;
	border-collapse: collapse;
	background: var(--background-subdued);
	table-layout: fixed;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	overflow: hidden;
}
.empty-deployments-card {
	position: relative;
	min-height: 180px;
	padding: 60px;
	display: grid;
	place-items: center;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
}
.empty-deployments-card :deep(.v-info) {
	position: static !important;
	inset: auto !important;
	width: auto;
	height: auto;
	margin: 0;
	transform: none !important;
	justify-self: center;
	align-self: center;
}
th,
td {
	padding: 16px 20px;
	text-align: left;
	vertical-align: middle;
	border-bottom: 1px solid var(--border-normal);
}
.date-cell {
	white-space: nowrap;
	padding-inline-end: 72px;
}
.date-cell + td {
	padding-inline-start: 32px;
}
.commit-cell {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	white-space: nowrap;
}
th {
	color: var(--foreground-subdued);
	font-size: 12px;
	font-weight: 600;
	opacity: 0.75;
	text-transform: uppercase;
}
.clickable {
	cursor: pointer;
}
.clickable:hover {
	background: var(--background-highlight);
}
.clickable > td {
	transition: background-color 120ms ease;
}
.clickable:hover > td,
.clickable:focus-visible > td {
	background: var(--background-highlight);
}
.application-cell {
	min-width: 0;
	overflow: hidden;
}
th:first-child {
	width: 30%;
}
th:nth-child(2) {
	width: 17%;
}
td strong,
td small,
.application-cell strong {
	display: block;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
small {
	color: var(--foreground-subdued);
}
.mono {
	font-family: var(--family-monospace);
}
</style>
