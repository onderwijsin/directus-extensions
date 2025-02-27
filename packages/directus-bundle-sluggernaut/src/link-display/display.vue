<template>
	<div class="link-display">
		<span>{{ value }}</span>
		<div v-if="isSupported" class="copy-btn-holder">
			<VButton secondary x-small icon @click.stop="copy(value)">
				<VIcon  
					:name="!copied ? 'content_copy' : 'check'" 
					:small="true"
					color="#878787"
				/>
			</VButton>
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
	position: relative;
	display: flex;
	flex-direction: row;
	gap: 1rem;
	align-items: center;
	width: 100%
}

.copy-btn-holder {
	display: grid;
	place-content: center;
	position: absolute;
	right: -12px;
	top: 50%;
	transform: translateY(-50%);
}
</style>
