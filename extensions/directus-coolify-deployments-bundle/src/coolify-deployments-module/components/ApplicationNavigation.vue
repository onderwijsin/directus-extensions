<script setup lang="ts">
import type { ApplicationSummary } from '../types'

import { deploymentPath } from '../utils'

defineProps<{
	applications: Pick<ApplicationSummary, 'directusApplicationId' | 'name'>[]
	selectedId?: string
}>()
</script>

<template>
	<nav class="application-navigation" aria-label="Deployments">
		<v-list nav>
			<v-list-item :active="!selectedId" to="/coolify-deployments">
				<v-list-item-icon><v-icon name="rocket_launch" /></v-list-item-icon>
				<v-list-item-content>All deployments</v-list-item-content>
			</v-list-item>
			<v-list-item
				v-for="application in applications"
				:key="application.directusApplicationId"
				:active="application.directusApplicationId === selectedId"
				:to="deploymentPath(application.directusApplicationId)"
			>
				<v-list-item-icon><v-icon name="web" /></v-list-item-icon>
				<v-list-item-content>
					<v-text-overflow :text="application.name" />
				</v-list-item-content>
			</v-list-item>
		</v-list>
	</nav>
</template>

<style scoped>
.application-navigation {
	min-width: 220px;
}
</style>
