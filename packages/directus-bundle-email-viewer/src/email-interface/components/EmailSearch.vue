<script setup lang="ts">
const query = defineModel()
</script>

<template>
    <div style="padding: 20px 0px;">
        <VInput
            v-model="query"
            type="string"
            :nullable="false"
            placeholder="Enter a search term"
        />
    </div>
</template>