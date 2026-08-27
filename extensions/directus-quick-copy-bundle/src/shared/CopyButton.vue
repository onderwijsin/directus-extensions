<script setup lang="ts">
/** Copies a nullable field value when the browser exposes the Clipboard API. */
import { useClipboard } from '@vueuse/core'

withDefaults(
	defineProps<{
		value: string | null
		small?: boolean
		xSmall?: boolean
	}>(),
	{
		small: true,
		xSmall: false,
	},
)

const { copy, copied, isSupported } = useClipboard({ legacy: true })
</script>

<template>
	<div v-if="isSupported" class="quick-copy-button">
		<v-button
			secondary
			icon
			:small="small"
			:x-small="xSmall"
			:aria-label="copied ? 'Copied' : 'Copy value'"
			@click.stop="copy(value ?? '')"
		>
			<v-icon :name="copied ? 'check' : 'content_copy'" small color="#878787" />
		</v-button>
	</div>
</template>

<style scoped>
.quick-copy-button {
	display: inline-flex;
}
</style>
