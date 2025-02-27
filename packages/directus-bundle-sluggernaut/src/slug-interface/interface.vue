<template>
	<div class="field-wrapper">
		<VInput :model-value="value" :disabled="disabled" :placeholder="placeholder" @update:model-value="handleChange" />
		<div v-if="isSupported" class="copy-btn">
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
import { translations } from '../shared/constants';

type Translations = typeof translations["slug"];

export default defineComponent({
	props: {
		value: {
			type: String,
			default: null,
		},
		disabled: {
			type: Boolean,
			default: false,
		},
		locale: {
			type: String,
			default: 'en'
		}
	},
	emits: ['input'],
	setup(props, { emit }) {

		function handleChange(value: string): void {
			emit('input', value);
		}

		const { copy, copied, isSupported } = useClipboard()

		const placeholder = props.locale in translations ? translations.slug[props.locale as keyof Translations] : translations.slug['en'];

		return {
			handleChange,
			copy, copied, isSupported,
			placeholder
		}
	},
});
</script>

<style>
.field-wrapper {
	position: relative
}	

.copy-btn {
	position: absolute;
	right: 1.5rem;
	top: 50%;
	transform: translateY(-50%);
}
	
</style>
