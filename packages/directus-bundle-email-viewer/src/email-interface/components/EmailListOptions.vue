<script setup lang="ts">
import type { Ref } from "vue";
import type { User } from "../../types";
import { useApi } from "@directus/extensions-sdk";
import { ref } from "vue";

const limit = defineModel<number>("limit");
const api = useApi();

const users = defineModel<string[]>("users");
const userOptions: Ref<{ value: string; text: string }[]> = ref([]);

const fetchUsers = async () => {
	try {
		const response = await api.get("/server/email-viewer/users");
		const data = response.data as User[];
		userOptions.value = data.map((user) => ({ value: user.id, text: `${user.displayName} <${user.email}>` }));
	}
	catch (error) {
		console.warn(error);
	}
};

fetchUsers();
</script>

<template>
	<div class="field-grid">
		<div style="padding: 20px 0px;">
			<h2 class="type-label">
				Select users
			</h2>
			<VSelect
				v-model="users"
				:items="userOptions"
				multiple
				show-deselect
				:nullable="false"
				:multiple-preview-threshold="2"
			/>
			<p class="type-note">
				Select the email accounts you want searched
			</p>
		</div>
		<div style="padding: 20px 0px;">
			<h2 class="type-label">
				Limit per user
			</h2>
			<VInput
				v-model="limit"
				type="number"
				:min="1"
				:max="5000"
				:step="1"
				:nullable="false"
			/>
			<p class="type-note">
				Emails per account
			</p>
		</div>
	</div>

	<VNotice>
		<div>
			<p style="margin-bottom: 0.5rem;">
				The amount of emails you see, is not always equal to the limit set. This is due to:
			</p>
			<ol>
				<li>email threads consisting of multiple emails (but only being one item in the list above);</li>
				<li>The filtering of internal email traffic, which is being filtered after the limit is applied, due to technical reasons.</li>
			</ol>
		</div>
	</VNotice>
</template>

<style scoped>
.field-grid {
	display: grid;
	grid-template-columns: 2fr 1fr;
	gap: 1rem;
}

.type-label {
	color: var(--theme--foreground-accent);
	font-size: 16px;
	font-weight: var(--theme--form--field--label--font-weight);
	font-family: var(--theme--form--field--label--font-family);
	font-style: normal;
	line-height: 19px;
	margin-bottom: 0.5rem;
}

.type-note {
	color: var(--theme--foreground-subdued);
	font-weight: var(--theme--fonts--sans--font-weight);
	font-size: 13px;
	font-family: var(--theme--fonts--sans--font-family);
	font-style: italic;
	line-height: 18px;
	margin-top: 0.5rem;
}
</style>
