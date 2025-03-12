<script setup lang="ts">
import type { FormattedEmail } from "../interface.vue";
import DOMPurify from "dompurify";
import { computed, ref } from "vue";
import Recipients from "./Recipients.vue";
import Sender from "./Sender.vue";

const props = defineProps<{
	data: FormattedEmail;
}>();

const active = ref<boolean>(false);

function toggle() {
	active.value = !active.value;
}

const sanitizedEmail = computed(() => {
	if (!props.data.body?.content) return "";
	if (props.data.body.contentType === "plaintext") return props.data.body.content;
	return DOMPurify.sanitize(props.data.body?.content, {
		ADD_ATTR: ["target", "rel", "href"], // Allow target and rel attributes
		ALLOWED_TAGS: ["a", "b", "i", "strong", "em", "p", "span", "div", "table", "tr", "td", "ul", "ol", "li", "br", "hr"] // Keep a tags
	});
});
</script>

<template>
	<VButton small @click.prevent="toggle">
		<span>View email</span>
	</VButton>
	<v-drawer
		v-model="active"
		:title="data.subject"
		icon="email"
		header-shadow
		header-small
		sidebar-resizeable
		persistent
		@cancel="toggle"
	>
		<div class="item-content">
			<div class="meta-info">
				<div style="display: flex; flex-direction: row; gap: 1rem; flex-shrink: 0;">
					<VChip small style="flex-shrink: 0; background-color: var(--project-color); font-weight: 700;">
						{{ data.prettySentDate }}
					</VChip>
					<Sender :data="data.from" />
				</div>
				<div style="display: flex; flex-direction: row; gap: 0.5rem 1rem; flex-grow: 1; flex-wrap: wrap;">
					<Recipients :data="data.toRecipients" />
				</div>
			</div>

			<div class="email-content">
				<!-- eslint-disable-next-line -->
				<div v-html="sanitizedEmail" />
			</div>
		</div>
	</v-drawer>
</template>

<style scoped>
.item-content {
	padding: 0 16px 32px;

	position: relative;
	flex-grow: 1;
	overflow: auto;

	@media (min-width: 600px) {
		padding: 0 32px 132px;
	}
}

.meta-info {
	font-size: 13px;
	background: var(--theme--background-normal);
	margin-bottom: 16px;
	padding: 8px;
	border-radius: var(--theme--border-radius);
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 1rem;
	@media screen and (max-width: 600px) {
		padding: 12px;
	}
}

.email-content img {
	max-width: 100%;
	height: auto;
}

div[name='messageReplySection'] {
	margin-top: 32px;
}
</style>
