<script setup lang="ts">
import type { ApplicationSummary } from '../types'

import { useRouter } from 'vue-router'

import ApplicationStateBadge from './ApplicationStateBadge.vue'

defineProps<{ applications: ApplicationSummary[]; applicationPath: (id: string) => string }>()
const router = useRouter()
/**
 * Format an ISO timestamp for the current locale.
 * @param value - ISO timestamp.
 * @returns Localized date and time, or an em dash.
 */
const formatDate = (value: string | null) =>
	value
		? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
				new Date(value),
			)
		: '—'
</script>

<template>
	<v-info v-if="applications.length === 0" icon="apps" title="No applications configured" center>
		Add a Coolify application to start deploying from Directus.
	</v-info>
	<div v-else class="application-grid">
		<div
			v-for="application in applications"
			:key="application.id"
			class="application-card clickable"
			@click="router.push(applicationPath(application.id))"
		>
			<div class="application-heading" :title="application.name">
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
			<div class="source-meta">
				<span v-if="application.gitBranch"
					><v-icon name="account_tree" small /> {{ application.gitBranch }}</span
				>
			</div>
			<div class="application-footer">
				<ApplicationStateBadge :state="application.state" />
				<span class="subdued">{{
					formatDate(application.latestDeployment?.createdAt ?? null)
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
	transition:
		background-color 120ms ease,
		border-color 120ms ease;
}
.application-heading {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	font-size: 16px;
}
.application-heading strong {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 15px;
	white-space: nowrap;
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
.source-meta {
	display: flex;
	align-items: center;
	gap: 12px;
	color: var(--foreground-subdued);
	font-size: 13px;
}
.mono {
	font-family: var(--family-monospace);
}
.clickable {
	cursor: pointer;
}
.clickable:hover {
	background: var(--background-highlight);
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
