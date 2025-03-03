<template>
	<VDivider
		:inlineTitle="true"
		:large="true"
	>
		<VIcon name="email" />
		<span>Emails</span>
	</VDivider>
	<EmailSearch v-model="query" />
	<SkeletonEmailList v-if="!isCreate && pending" />
	<VNotice v-else-if="!isCreate && !data.length" :type="type" :icon="pending ? 'autorenew' : undefined">
		{{ label }}
	</VNotice>
	<EmailList v-else="!isCreate" :data="data" />
	<div style="padding: 20px 0px;">
		<VDivider
			:inlineTitle="true"
			:large="false"
		>
			<VIcon name="inbox_customize" />
			<span>Options</span>
		</VDivider>
		<EmailListOptions v-if="!isCreate" v-model:limit="limit" v-model:users="users" />
	</div>
	
	
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { Email } from '../types';
import EmailList from './components/EmailList.vue';
import EmailListOptions from './components/EmailListOptions.vue';
import SkeletonEmailList from './components/SkeletonEmailList.vue';
import EmailSearch from './components/EmailSearch.vue';

export type FormattedEmail = Email & {
	prettySentDate: string;
}

const defaultLimit = '10';

const props = defineProps<{
	email_field: string;
	primaryKey: string | number;
	collection: string;
}>();


const api = useApi();

const email = ref('')
const pending = ref(true)
const error: Ref<any> = ref(null)
async function fetchEmailValue() {
	if (!props.email_field || isCreate.value) return;
	pending.value = true
	try {
		const response = await api.get(`/items/${props.collection}/${props.primaryKey}`);
		email.value = response.data.data[props.email_field];
		return ;
	} catch (err) {
		error.value = err;
		pending.value = false
		console.warn(err);
	}
}

const label = computed(() => {
	if (!email.value) {
		return 'No email address provided';
	}
	if (pending.value) return 'Searching for email history...';
	return `We could not find any emails for ${email.value} and the selected inboxes`;
})

const type = computed(() => {
	if (!props.email_field) return 'warning'
	return 'info'
})

const isCreate = computed(() => props.primaryKey === '+')


watch(() => props.primaryKey, fetchEmailValue)


const data: Ref<FormattedEmail[]> = ref([])

async function fetchEmails() {
	if (!email.value) return;
	pending.value = true
	try {
		const response: { data: Email[] } = await api.post(`/server/email-viewer/emails`, {
			email: email.value,
			query: query.value,
			users: users.value || [],
			limit: limit.value
		});

		data.value = formatData(response.data);
		pending.value = false
		return ;
	} catch (err) {
		error.value = err;
		pending.value = false
		console.warn(err);
	}
}


const formatData = (data: Email[]) => {
	return data.map((email) => {
		return {
			...email,
			prettySentDate: format(new Date(email.sentDateTime), 'HH:mm dd/MM/yy', { locale: nl })
		}
	})
}


// Load limit and users from localStorage if available
const limit: Ref<number> = ref(parseInt(localStorage.getItem('email_history_interface:limit') || defaultLimit, 10));
const users: Ref<string[] | null> = ref(JSON.parse(localStorage.getItem('email_history_interface:users') || '[]'));
const query: Ref<string> = ref(localStorage.getItem('email_history_interface:query') || '');

// Update localStorage when limit or users change
watch(limit, (newLimit) => {
	localStorage.setItem('email_history_interface:limit', newLimit.toString());
});
watch(users, (newUsers) => {
	localStorage.setItem('email_history_interface:users', JSON.stringify(newUsers));
});
watch(query, (newQuery) => {
	localStorage.setItem('email_history_interface:query', newQuery || '');
});

watch([email, limit, users, query], fetchEmails)

</script>

