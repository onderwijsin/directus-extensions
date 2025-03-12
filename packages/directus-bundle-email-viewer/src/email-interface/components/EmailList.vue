<script setup lang="ts">
import type { FormattedEmail } from "../interface.vue";
import EmailBodyViewer from "./EmailBodyViewer.vue";
import Recipients from "./Recipients.vue";
import Sender from "./Sender.vue";

defineProps<{
	data: FormattedEmail[];
}>();
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
				<Sender :data="email.from" />
				<Recipients :data="email.toRecipients" />
			</VListItem>
			<div style="margin-bottom: 16px; display: flex; flex-direction: row; flex-wrap: wrap; gap: 0.5rem;">
				<EmailBodyViewer v-if="email.body?.content" :data="email" />
				<VButton small secondary :href="email.webLink" target="_blank">
					<span>View in outlook</span>
					<VIcon name="arrow_outward" small style="margin-left: 1rem;" />
				</VButton>
			</div>
		</VListGroup>
	</VList>
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
