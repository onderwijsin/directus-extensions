<script setup lang="ts">

import type { EmailAddress } from "../../types";
defineProps<{
    data: EmailAddress
}>()
</script>

<template>
    <span style="display: flex; align-items: center; gap: 4px;">
        <VIcon name="outgoing_mail" small style="position: relative; top: 1px;" />
        <span>{{ data.emailAddress.name }} &lt;<a :href="`mailto:${data.emailAddress.address}`" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ data.emailAddress.address }}</a>&gt;</span>
    </span>
</template>