<template>
	<VNotice v-if="!isCreate" :type="type" :icon="pending ? 'autorenew' : undefined">
		{{ label }}
	</VNotice>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

export default defineComponent({
	props: {
		email_field: {
			type: String,
		},
		primaryKey: {
			type: [String, Number],
			required: true
		},
	},
	setup(props,  { attrs }) {
		const { collection } = attrs;
		const api = useApi();

		const email = ref('')
		const pending = ref(true)
		const error: Ref<any> = ref(null)
		async function fetchEmail() {
			if (!props.email_field || isCreate.value) return;
			pending.value = true
			try {
				const response = await api.get(`/items/${collection}/${props.primaryKey}`);
				email.value = response.data.data[props.email_field];
				pending.value = false
				return ;
			} catch (err) {
				error.value = err;
				console.warn(err);
			}
		}

		const label = computed(() => {
			if (!email.value) {
				return 'No email address provided';
			}
			if (pending.value) return 'Searching for email history...';
			return `Emails will be rendered here!`
		})

		const type = computed(() => {
			if (!props.email_field) return 'warning'
			return 'info'
		})

		const isCreate = computed(() => props.primaryKey === '+')


		watch(() => props.primaryKey, fetchEmail)


		return { pending, label, type, isCreate }
	},
});
</script>
