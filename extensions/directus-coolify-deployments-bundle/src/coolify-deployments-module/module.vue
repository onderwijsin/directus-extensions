<script setup lang="ts">
import type { PublicCoolifyProject } from '../shared/types'

import { onMounted, shallowRef } from 'vue'

import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const api = useCoolifyDeploymentsApi()
const projects = shallowRef<PublicCoolifyProject[]>([])
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)

/**
 * Build the Studio route for a configured project.
 * @param projectId - Stable configured project ID.
 * @returns The project route.
 */
const projectPath = (projectId: string) =>
	`/admin/coolify-deployments/projects/${encodeURIComponent(projectId)}`

/**
 * Load configured projects from the authenticated endpoint.
 * @returns Nothing.
 */
const loadProjects = async () => {
	loading.value = true
	error.value = null

	try {
		projects.value = await api.listProjects()
	} catch (caughtError) {
		error.value = caughtError instanceof Error ? caughtError.message : 'Unable to load projects'
	} finally {
		loading.value = false
	}
}

onMounted(() => {
	void loadProjects()
})
</script>

<template>
	<private-view title="Deployments">
		<div class="deployment-view">
			<v-notice v-if="error" type="warning">{{ error }}</v-notice>
			<v-notice v-else-if="loading" type="info">Loading configured projects…</v-notice>
			<div v-else class="projects">
				<div v-for="project in projects" :key="project.id" class="project-row">
					<div>
						<strong>{{ project.name }}</strong>
						<div>{{ project.productionUrl ?? 'No production URL configured' }}</div>
					</div>
					<v-button :to="projectPath(project.id)">View deployments</v-button>
				</div>
			</div>
			<pre>{{ JSON.stringify(projects, null, 2) }}</pre>
		</div>
	</private-view>
</template>

<style scoped>
.deployment-view {
	padding: 24px;
}

.project-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 16px;
	border: 1px solid var(--border-normal);
	border-radius: 6px;
}

.projects {
	display: grid;
	gap: 12px;
	margin-bottom: 24px;
}

pre {
	max-width: 100%;
	overflow: auto;
	padding: 16px;
	background: var(--background-normal);
}
</style>
