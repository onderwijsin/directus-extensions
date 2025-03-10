<script setup lang="ts">
import { useClipboard } from "@vueuse/core";

withDefaults(
	defineProps<{
		value: string | null;
		small?: boolean;
		xSmall?: boolean;
	}>(),
	{
		small: true,
		xSmall: false
	}
);

const { copy, copied, isSupported } = useClipboard();
</script>

<template>
	<div v-if="isSupported" class="copy-btn">
		<VButton secondary icon :small="small" :x-small="xSmall" @click.stop="copy(value || '')">
			<VIcon
				:name="!copied ? 'content_copy' : 'check'"
				small
				color="#878787"
			/>
		</VButton>
	</div>
</template>

<style scoped>
.copy-btn {
	position: absolute;
	right: 1rem;
	top: 50%;
	transform: translateY(-50%);
}
</style>
