<script setup lang="ts">
import type { DeploymentStatus as Status } from '../types'

defineProps<{ status: Status }>()

const labels: Record<Status, string> = {
	queued: 'Queued',
	building: 'Building',
	ready: 'Ready',
	error: 'Error',
	canceled: 'Canceled',
}
</script>

<template>
	<v-chip :class="['status', `status-${status}`]">
		<v-icon v-if="status === 'building'" name="sync" class="status-icon spinning" />
		<v-icon v-else-if="status === 'ready'" name="check_circle" class="status-icon" />
		<v-icon
			v-else-if="status === 'error' || status === 'canceled'"
			name="error"
			class="status-icon"
		/>
		<v-icon v-else name="schedule" class="status-icon" />
		{{ labels[status] }}
	</v-chip>
</template>

<style scoped>
.status {
	--status-color: var(--foreground-subdued);
	color: var(--status-color);
}

.status-ready {
	--status-color: var(--success);
}
.status-building {
	--status-color: var(--warning);
}
.status-error {
	--status-color: var(--danger);
}
.status-canceled {
	--status-color: var(--foreground-subdued);
}
.status-icon {
	color: var(--status-color);
}
.spinning {
	animation: spin 1.2s linear infinite;
}
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
