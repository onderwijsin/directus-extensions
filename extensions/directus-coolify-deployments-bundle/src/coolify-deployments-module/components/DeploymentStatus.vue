<script setup lang="ts">
import type { DeploymentStatus as Status } from '../types'

defineProps<{ status: Status; primary?: boolean }>()

const labels: Record<Status, string> = {
	queued: 'Queued',
	building: 'Building',
	ready: 'Ready',
	error: 'Error',
	canceled: 'Canceled',
}
</script>

<template>
	<v-chip :class="['status', `status-${status}`, primary ? 'status-primary' : '']">
		<v-icon v-if="status === 'building'" name="sync" small class="status-icon spinning" />
		<v-icon v-else-if="status === 'ready'" name="check_circle" small class="status-icon" />
		<v-icon
			v-else-if="status === 'error' || status === 'canceled'"
			name="error"
			small
			class="status-icon"
		/>
		<v-icon v-else name="schedule" small class="status-icon" />
		{{ labels[status] }}
	</v-chip>
</template>

<style scoped>
.status {
	--status-color: var(--foreground-subdued);
	display: inline-flex;
	align-items: center;
	gap: 6px;
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
.status-primary {
	--status-color: var(--primary);
}
.status :deep(.chip-content) {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
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
