<script setup lang="ts">
import type { FormattedEmail } from "../interface.vue";
import { defineProps, ref } from "vue";
import EmailBodyViewer from "./EmailBodyViewer.vue";

defineProps<{
	data: FormattedEmail[];
}>();

const selectedEmail = ref<FormattedEmail | null>(null);

const handleShowBody = (email: FormattedEmail) => {
	selectedEmail.value = email;
	// const win = window.open("", "_blank");
	// win?.document.write(email.body?.content);
};
</script>

<template>
	<VList :mandatory="false">
		<VListGroup
			v-for="email in data"
			:key="email.id"
		>
			<template #activator>
				<VListItem dense style="display: flex; align-items: center; gap: 1rem;">
					<VChip x-small style="flex-shrink: 0;">
						{{ email.prettySentDate }}
					</VChip>
					<span class="sm-text bold no-wrap" style="flex-grow: 1;">
						{{ email.subject }}
					</span>
					<div style="display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0;">
						<VIcon :name="email.isRead ? 'visibility' : 'visibility_off'" small style="opacity: 0.6;" />
						<VIcon v-if="email.hasAttachments" name="attachment" small style="opacity: 0.6;" />
					</div>
				</VListItem>
			</template>
			<VListItem>
				<!-- eslint-disable-next-line -->
				<div class="sm-text" style="margin: 10px 0 6px; line-height: 2" v-html="email.bodyPreview" />
			</VListItem>
			<VListItem style="font-style: italic; margin-bottom: 10px; font-size: 10px; display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 1.5rem;">
				<span style="display: flex; align-items: center; gap: 4px;">
					<VIcon name="outgoing_mail" small style="position: relative; top: 1px;" />

					<span>{{ email.from.emailAddress.name }} &lt;<a :href="`mailto:${email.from.emailAddress.address}`" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ email.from.emailAddress.address }}</a>&gt;</span>
				</span>
				<span
					v-for="(recipient, i) in email.toRecipients"
					style="display: flex; align-items: center; gap: 4px;"
					:style="i > 2 ? 'display: none' : ''"
				>
					<VIcon name="move_to_inbox" small />
					<span>{{ recipient.emailAddress.name }} &lt;<a :href="`mailto:${recipient.emailAddress.address}`" target="_blank" style="text-decoration: underline; color: var(--project-color)">{{ recipient.emailAddress.address }}</a>&gt;</span>
				</span>
			</VListItem>
			<div style="margin-bottom: 16px; display: flex; flex-direction: row; flex-wrap: wrap; gap: 0.5rem;">
				<VButton v-if="email.body?.content" small @click.prevent="handleShowBody(email)">
					<span>View email</span>
				</VButton>
				<VButton small secondary :href="email.webLink" target="_blank">
					<span>View in outlook</span>
					<VIcon name="arrow_outward" small style="margin-left: 1rem;" />
				</VButton>
			</div>
		</VListGroup>
	</VList>
	<EmailBodyViewer v-if="selectedEmail" :data="selectedEmail.body" />
</template>

<style scoped>
.sm-text {
	font-size: 12px;
	line-clamp: 1;
}

.no-wrap {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.bold {
	font-weight: 700;
}
</style>
