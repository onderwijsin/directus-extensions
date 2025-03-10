<script setup lang="ts">
import { translations } from "./constants";
import CopyButton from "./CopyButton.vue";

type Translations = typeof translations["path"];

const props = defineProps<{
	value: string | null;
	disabled: boolean;
	locale: string;
	fieldType: "slug" | "path";
}>();

const emit = defineEmits<{
	(e: "input", value: string): void;
}>();

function handleChange(value: string): void {
	emit("input", value);
}

const placeholder = props.locale in translations ? translations[props.fieldType][props.locale as keyof Translations] : translations[props.fieldType]["en"];
</script>

<template>
	<div class="field-wrapper">
		<VInput :model-value="value" :disabled="fieldType === 'path' || disabled" :placeholder="placeholder" @update:model-value="handleChange" />
		<CopyButton :value="value" />
	</div>
</template>

<style scoped>
.field-wrapper {
	position: relative;
}
</style>
