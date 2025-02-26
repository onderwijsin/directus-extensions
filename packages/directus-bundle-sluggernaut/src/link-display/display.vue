<template>
	<div class="link-display">
		<span>{{ value }}</span>
		<div v-if="isSupported">
			<button @click.stop="copy(value)">
				<VIcon  
					:name="!copied ? 'content_copy' : 'check'" 
					:small="true"
					color="#878787"
				/>
			</button>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useClipboard } from '@vueuse/core'

export default defineComponent({
	props: {
		value: {
			type: String,
			default: null,
		},
	},
	setup() {
		const { copy, copied, isSupported } = useClipboard()


		return {
			copy,
			isSupported,
			copied,
		};
	},
});
</script>

<style>
.link-display {
	display: flex;
	flex-direction: row;
	gap: 1rem;
	align-items: center;
}
</style>
