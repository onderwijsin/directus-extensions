<template>
	<input :value="value" @input="handleChange" />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
	props: {
		value: {
			type: String,
			default: null,
		},
	},
	emits: ['input'],
	setup(props, { emit }) {
		return { handleChange };

		function handleChange(event: Event): void {
			const value = (event.target as HTMLInputElement).value;
			emit('input', value);
		}
	},
});
</script>
