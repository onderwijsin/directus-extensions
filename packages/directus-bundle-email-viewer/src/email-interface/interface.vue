<script lang="ts" setup>
import type { Ref } from "vue";
import type { Email } from "../types";
import { useApi } from "@directus/extensions-sdk";
import { watchDebounced } from "@vueuse/core";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { computed, ref, watch, watchEffect } from "vue";
import EmailList from "./components/EmailList.vue";
import EmailListOptions from "./components/EmailListOptions.vue";
import EmailSearch from "./components/EmailSearch.vue";
import SkeletonEmailList from "./components/SkeletonEmailList.vue";

export type FormattedEmail = Email & {
	prettySentDate: string;
};

const props = defineProps<{
	email_field: string;
	primaryKey: string | number;
	collection: string;
}>();

const defaultLimit = "10";

const api = useApi();

const email = ref("");
const pending = ref(true);
const loading = ref(true);
const error: Ref<any> = ref(null);
const isCreate = computed(() => props.primaryKey === "+");

function triggerLoadingState() {
	setTimeout(() => {
		if (pending.value) loading.value = true;
	}, 200);
}

async function fetchEmailValue() {
	if (!props.email_field || isCreate.value) return;
	pending.value = true;
	loading.value = true;

	try {
		const response = await api.get(`/items/${props.collection}/${props.primaryKey}`);
		email.value = response.data.data[props.email_field];
	}
	catch (error_) {
		error.value = error_;
		pending.value = false;
		loading.value = false;
		console.warn(error_);
	}
}

const label = computed(() => {
	if (!email.value) {
		return "No email address provided";
	}

	if (pending.value) return "Searching for email history...";
	return `We could not find any emails for ${email.value} and the selected inboxes`;
});

const type = computed(() => {
	if (!props.email_field) return "warning";
	return "info";
});

watch(() => props.primaryKey, fetchEmailValue);

const data: Ref<FormattedEmail[]> = ref([]);

// Load limit and users from localStorage if available
const limit: Ref<number> = ref(Number.parseInt(localStorage.getItem("email_history_interface:limit") || defaultLimit, 10));
const users: Ref<string[]> = ref(JSON.parse(localStorage.getItem("email_history_interface:users") || "[]"));
const query: Ref<string> = ref(localStorage.getItem("email_history_interface:query") || "");

const formatData = (data: Email[]) => {
	return data.map((email) => {
		return {
			...email,
			prettySentDate: format(new Date(email.sentDateTime), "HH:mm dd/MM/yy", { locale: nl })
		};
	});
};

async function fetchEmails() {
	if (!email.value) {
		loading.value = false;
		pending.value = false;
		return;
	}

	pending.value = true;
	triggerLoadingState();

	try {
		const response: { data: Email[] } = await api.post("/server/email-viewer/emails", {
			email: email.value,
			query: query.value,
			users: users.value || [],
			limit: limit.value
		});

		data.value = formatData(response.data);
	}
	catch (error_) {
		error.value = error_;
		console.warn(error_);
	}
	finally {
		pending.value = false;
		loading.value = false;
	}
}

// Update localStorage when limit or users change
watchEffect(() => {
	localStorage.setItem("email_history_interface:limit", limit.value.toString());
	localStorage.setItem("email_history_interface:users", JSON.stringify(users.value));
	localStorage.setItem("email_history_interface:query", query.value || "");
});

watch([email, limit, users], fetchEmails);
watchDebounced(query, fetchEmails, { debounce: 200 });
</script>

<template>
	<div v-if="!isCreate">
		<VDivider
			inline-title
			large
		>
			<VIcon name="email" />
			<span>Emails</span>
		</VDivider>
		<EmailSearch v-model="query" />
		<SkeletonEmailList v-if="loading" />
		<VNotice v-else-if="data.length === 0" :type="type" :icon="loading ? 'autorenew' : undefined">
			{{ label }}
		</VNotice>
		<EmailList v-else :data="data" />
		<div style="padding: 20px 0px;">
			<VDivider
				inline-title
				:large="false"
			>
				<VIcon name="inbox_customize" />
				<span>Options</span>
			</VDivider>
			<EmailListOptions v-model:limit="limit" v-model:users="users" />
		</div>
	</div>
	<!-- This span is needed to fix https://github.com/onderwijsin/directus-extensions/issues/42 -->
	<span />
</template>
