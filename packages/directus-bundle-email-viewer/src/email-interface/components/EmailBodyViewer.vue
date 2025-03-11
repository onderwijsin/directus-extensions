<script setup lang="ts">
defineProps<{
	data: {
		content: string;
		contentType: "html" | "plaintext";
	} | null;
}>();
</script>

<template>
	<!-- eslint-disable-next-line -->
    <div v-if="data" v-html="data.content" />
</template>
