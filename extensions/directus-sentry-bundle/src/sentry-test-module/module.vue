<template>
	<private-view title="Sentry Test Module">
		<v-button @click="triggerError">Trigger Error</v-button>
	</private-view>
</template>

<script lang="ts">
export default {
	methods: {
		/**
		 * Trigger an intentional front end error for Sentry
		 * @returns void
		 */
		triggerError() {
			const error = new Error('Intentional front end error for Sentry')
			Sentry.captureException(error)
		},
	},
}
</script>
