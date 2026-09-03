<script setup lang="ts">
defineProps<{ items: { text: string; value: string }[]; label?: string; disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
	<label class="fallback-select">
		<span v-if="label">{{ label }}</span>
		<select v-model="model" :disabled="disabled">
			<option v-for="item in items" :key="item.value" :value="item.value">
				{{ item.text }}
			</option>
		</select>
	</label>
</template>

<style scoped>
.fallback-select {
	display: grid;
	gap: 0.25rem;
}

select {
	min-height: 2.25rem;
	padding-inline: 0.5rem;
	border: 1px solid var(--theme--form--field--input--border-color, #d3dce3);
	border-radius: 0.25rem;
	background: var(--theme--form--field--input--background, white);
	color: inherit;
}
</style>
