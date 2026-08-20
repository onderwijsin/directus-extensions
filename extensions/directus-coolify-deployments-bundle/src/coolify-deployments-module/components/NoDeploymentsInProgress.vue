<template>
	<div class="empty-deployments">
		<div class="empty-icon"><v-icon name="history" /></div>
		<div class="empty-copy">
			<strong>No deployments in progress</strong>
			<span>Select an application to deploy.</span>
		</div>
	</div>
</template>

<style scoped>
.empty-deployments {
	display: grid;
	grid-template-columns: auto 1fr;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 16px 20px;
	border: 1px solid var(--border-normal);
	border-radius: 8px;
	background: var(--background-subdued);
	color: var(--foreground-subdued);
	text-align: center;
}
.empty-deployments strong {
	color: var(--foreground-normal);
	font-size: 15px;
}
.empty-copy {
	display: grid;
	gap: 2px;
	justify-items: start;
	text-align: left;
}
.empty-icon {
	display: grid;
	width: 36px;
	height: 36px;
	place-items: center;
	border-radius: 50%;
	background: var(--background-subdued);
	color: var(--foreground-subdued);
}
.empty-icon :deep(.v-icon) {
	font-size: 20px;
}
</style>
