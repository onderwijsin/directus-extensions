<script setup lang="ts">
const query = defineModel()
</script>

<template>
    <div style="padding: 20px 0px; position: relative;">
        <VInput
            v-model="query"
            type="string"
            :nullable="false"
            placeholder="Enter a search term"
        />
        <VButton v-if="!!query" class="clear-btn" secondary icon x-small @click.stop="query = ''">
            <VIcon name="close" small color="#878787" />
        </VButton>
    </div>
</template>

<style scoped>
.clear-btn {
	position: absolute;
	right: 1.5rem;
	top: 50%;
	transform: translateY(-50%);
}
</style>