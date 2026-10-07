<script setup lang="ts">
import { RouterView } from 'vue-router'

import { provideApplicationNavigation } from './composables/useApplicationNavigation'
import { useCoolifyDeploymentsApi } from './composables/useCoolifyDeploymentsApi'

const api = useCoolifyDeploymentsApi()
provideApplicationNavigation(api.listApplications)
</script>

<template>
	<RouterView />
</template>
