<script setup lang="ts">
import type { EmailAddress } from "../../types";

defineProps<{
	data: EmailAddress[];
}>();
</script>

<template>
	<span
		v-for="(recipient, i) in data"
		style="display: flex; align-items: center; gap: 4px;"
		:style="i > 2 ? 'display: none' : ''"
	>
		<VIcon name="move_to_inbox" small />
		<span>{{ recipient.emailAddress.name }} &lt;<a :href="`mailto:${recipient.emailAddress.address}`" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ recipient.emailAddress.address }}</a>&gt;</span>
	</span>
</template>
